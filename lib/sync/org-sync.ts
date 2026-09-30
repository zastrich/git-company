// lib/sync/org-sync.ts
// Single Responsibility: Bidirectional sync between local DB config and GitHub repo.
// - push: build business.json from local DB → commit to repo
// - pull: download business.json from repo → update local DB

import { prisma } from "../db/client";
import { Octokit } from "@octokit/rest";
import { BusinessConfig } from "../baac/types";
import { createAuditLog } from "../db/audit";

export type SyncDirection = "push" | "pull";

export interface SyncResult {
  direction: SyncDirection;
  success: boolean;
  message: string;
}

const DEFAULT_COLUMNS = [
  { name: "Backlog", description: "Issues aguardando priorização" },
  { name: "Em Progresso", description: "Issues sendo trabalhadas por agentes AI" },
  { name: "Revisão", description: "Aguardando revisão humana ou validação" },
  { name: "Ação Manual", description: "Requer ação de um membro humano", isManualAction: true },
  { name: "Concluído", description: "Tarefas finalizadas", isDone: true },
];

/**
 * Resolve as colunas do workflow do projeto:
 *  - se o usuário configurou (CompanyConfig workflow_stages não-vazio), usa-as;
 *  - se configurou explicitamente como vazio (optou por não definir), retorna [];
 *  - se nunca configurou (sem a config), usa o default de 5 colunas.
 */
async function resolveWorkflowColumns(companyId: string): Promise<any[]> {
  const cfg = await prisma.companyConfig.findUnique({
    where: { companyId_key: { companyId, key: "workflow_stages" } },
  });
  if (!cfg) return DEFAULT_COLUMNS;
  try {
    const parsed = JSON.parse(cfg.value);
    return Array.isArray(parsed) ? parsed : DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

/**
 * Carrega business.json de um repositório GitHub.
 */
export async function fetchRemoteBusinessJson(
  token: string,
  owner: string,
  repo: string
): Promise<{ content: BusinessConfig; sha: string }> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: "business.json",
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error("business.json não encontrado no repositório.");
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return {
    content: JSON.parse(content) as BusinessConfig,
    sha: data.sha,
  };
}

/**
 * Constrói o business.json a partir dos dados locais no banco.
 */
export async function buildLocalBusinessJson(companyId: string): Promise<BusinessConfig> {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) throw new Error("Empresa não encontrada.");

  const agents = await prisma.agentConfig.findMany({
    where: { companyId },
    include: { provider: true },
    orderBy: { createdAt: "asc" },
  });

  const agentDefs = agents.map((a) => ({
    agentId: a.agentId,
    role: a.role,
    type: (a.type ?? "ai") as "ai" | "human",
    llm: a.type === "human" ? { provider: "openai" as const, model: "" } : {
      provider: (a.provider?.type ?? "openai") as any,
      model: a.model,
      apiKey: a.provider ? `{{${a.provider.type.toUpperCase()}_API_KEY}}` : undefined,
      baseUrl: a.provider?.baseUrl ?? undefined,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
    },
    context: a.context,
    tickIntervalSeconds: a.tickIntervalSeconds,
    labels: a.labels.split(",").map((l) => l.trim()).filter(Boolean),
    subordinates: a.subordinates.split(",").map((s) => s.trim()).filter(Boolean),
    githubUsername: a.githubUsername || undefined,
  }));

  // Construir orgChart
  const ceoAgent = agents.find((a) => a.isCeo);
  const orgChart = {
    ceo: ceoAgent
      ? {
          agentId: ceoAgent.agentId,
          role: ceoAgent.role,
          type: (ceoAgent.type ?? "ai") as "ai" | "human",
          context: ceoAgent.context,
          subordinates: ceoAgent.subordinates.split(",").filter(Boolean),
          githubUsername: ceoAgent.githubUsername || undefined,
        }
      : { agentId: "", role: "", type: "ai" as const, context: "", subordinates: [] as string[] },
    departments: {} as Record<string, any>,
  };

  // Incluir repos registrados
  const repos = await prisma.companyRepo.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
  const repoRefs = repos.map((r) => ({
    shortId: r.shortId,
    fullName: r.fullName,
    label: `repo:${r.shortId}`,
    description: r.description || undefined,
  }));

  return {
    companyName: company.name,
    mission: company.mission,
    version: "1.0",
    agents: agentDefs,
    infrastructure: {
      labels: [],
      milestones: [],
      project: {
        title: `${company.name} — Board`,
        views: [
          { name: "Kanban", layout: "BOARD" as const },
          { name: "Roadmap", layout: "ROADMAP" as const },
          { name: "Backlog", layout: "TABLE" as const },
        ],
        columns: await resolveWorkflowColumns(companyId),
      },
      workflows: [],
      issueLifecycle: {
        completionPatterns: ["[TAREFA_CONCLUÍDA]", "[TAREFA_CONCLUIDA]", "[TASK_COMPLETED]"],
        completionColumn: "Concluído",
        autoClose: true,
        defaultColumn: "Backlog",
        manualActionColumn: "Ação Manual",
      },
    },
    orgChart,
    repos: repoRefs.length > 0 ? repoRefs : undefined,
  };
}

/**
 * Push: envia business.json local para o repositório remoto.
 */
export async function pushToRemote(companyId: string): Promise<SyncResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { direction: "push", success: false, message: "Empresa não encontrada." };

  const businessJson = await buildLocalBusinessJson(companyId);

  // Formato MODULAR: business.json (índice) + agents/<id>.json + workflow.json
  const { pushModular } = await import("./modular");
  await pushModular(company.githubToken, company.githubOwner, company.repoName, businessJson);

  const { clearDirty } = await import("./dirty");
  await clearDirty(companyId);

  await createAuditLog({
    companyId,
    agentName: "System",
    action: "ORG_SYNC_PUSH",
    details: { agents: businessJson.agents.length },
  });

  return { direction: "push", success: true, message: "business.json enviado com sucesso." };
}

/**
 * Pull: baixa business.json do repositório remoto e atualiza o banco local.
 */
export async function pullFromRemote(companyId: string): Promise<SyncResult> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) return { direction: "pull", success: false, message: "Empresa não encontrada." };

  let config: BusinessConfig;
  try {
    const { pullModular } = await import("./modular");
    const parsed = await pullModular(company.githubToken, company.githubOwner, company.repoName);
    if (!parsed) {
      return { direction: "pull", success: false, message: "business.json não encontrado no repositório." };
    }
    config = parsed;
  } catch (err: any) {
    return { direction: "pull", success: false, message: `Erro ao baixar: ${err.message}` };
  }

  // Atualizar missão da empresa
  if (config.mission) {
    await prisma.company.update({
      where: { id: companyId },
      data: { mission: config.mission },
    });
  }

  // Sincronizar agentes do JSON remoto para o banco local
  if (config.agents && config.agents.length > 0) {
    for (const agentDef of config.agents) {
      const isHuman = agentDef.type === "human";

      // Humanos não têm provider. Para IAs, tenta casar por type;
      // se custom, casa também por baseUrl (host).
      let providerId: string | null = null;
      if (!isHuman) {
        let provider = null;
        if (agentDef.llm?.provider === "custom" && agentDef.llm?.baseUrl) {
          provider = await prisma.aIProvider.findFirst({
            where: { type: "custom", baseUrl: agentDef.llm.baseUrl },
          });
        }
        if (!provider) {
          provider = await prisma.aIProvider.findFirst({
            where: { type: agentDef.llm?.provider ?? "openai" },
          });
        }
        providerId = provider?.id ?? null;
      }

      const common = {
        role: agentDef.role,
        type: isHuman ? "human" : "ai",
        context: agentDef.context,
        providerId,
        model: isHuman ? "" : (agentDef.llm?.model ?? ""),
        temperature: agentDef.llm?.temperature ?? 0.2,
        maxTokens: agentDef.llm?.maxTokens ?? 4096,
        tickIntervalSeconds: Math.max(agentDef.tickIntervalSeconds ?? 300, 300),
        labels: (agentDef.labels ?? []).join(","),
        subordinates: (agentDef.subordinates ?? []).join(","),
        githubUsername: agentDef.githubUsername ?? "",
        isCeo: agentDef.agentId === "ceo",
      };

      await prisma.agentConfig.upsert({
        where: { companyId_agentId: { companyId, agentId: agentDef.agentId } },
        update: common,
        create: { companyId, agentId: agentDef.agentId, ...common },
      });
    }
  }

  await createAuditLog({
    companyId,
    agentName: "System",
    action: "ORG_SYNC_PULL",
    details: { agents: config.agents?.length ?? 0, mission: config.mission },
  });

  return { direction: "pull", success: true, message: `Sincronizado: ${config.agents?.length ?? 0} agentes.` };
}

/**
 * Executa sync bidirecional conforme direção.
 */
export async function syncCompany(companyId: string, direction: SyncDirection): Promise<SyncResult> {
  if (direction === "push") {
    return pushToRemote(companyId);
  }
  return pullFromRemote(companyId);
}
