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
    llm: {
      provider: a.provider.type as any,
      model: a.model,
      apiKey: `{{${a.provider.type.toUpperCase()}_API_KEY}}`,
      baseUrl: a.provider.baseUrl ?? undefined,
      temperature: a.temperature,
      maxTokens: a.maxTokens,
    },
    context: a.context,
    tickIntervalSeconds: a.tickIntervalSeconds,
    labels: a.labels.split(",").map((l) => l.trim()).filter(Boolean),
    subordinates: a.subordinates.split(",").map((s) => s.trim()).filter(Boolean),
  }));

  // Construir orgChart
  const ceoAgent = agents.find((a) => a.isCeo);
  const orgChart = {
    ceo: ceoAgent
      ? {
          agentId: ceoAgent.agentId,
          role: ceoAgent.role,
          context: ceoAgent.context,
          subordinates: ceoAgent.subordinates.split(",").filter(Boolean),
        }
      : { agentId: "", role: "", context: "", subordinates: [] as string[] },
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
      project: { title: `${company.name} — Board`, views: [] },
      workflows: [],
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

  const octokit = new Octokit({ auth: company.githubToken });
  const businessJson = await buildLocalBusinessJson(companyId);
  const content = Buffer.from(JSON.stringify(businessJson, null, 2)).toString("base64");

  // Buscar SHA atual do arquivo
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: company.githubOwner,
      repo: company.repoName,
      path: "business.json",
    });
    if (!Array.isArray(data) && data.type === "file") {
      sha = data.sha;
    }
  } catch {
    // Arquivo não existe ainda
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: company.githubOwner,
    repo: company.repoName,
    path: "business.json",
    message: "Sync: push local config to remote",
    content,
    sha,
  });

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

  let remote: { content: BusinessConfig; sha: string };
  try {
    remote = await fetchRemoteBusinessJson(company.githubToken, company.githubOwner, company.repoName);
  } catch (err: any) {
    return { direction: "pull", success: false, message: `Erro ao baixar: ${err.message}` };
  }

  const config = remote.content;

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
      // Encontrar provider pelo type
      const provider = await prisma.aIProvider.findFirst({
        where: { type: agentDef.llm.provider },
      });

      if (!provider) continue;

      await prisma.agentConfig.upsert({
        where: { companyId_agentId: { companyId, agentId: agentDef.agentId } },
        update: {
          role: agentDef.role,
          context: agentDef.context,
          providerId: provider.id,
          model: agentDef.llm.model,
          temperature: agentDef.llm.temperature ?? 0.2,
          maxTokens: agentDef.llm.maxTokens ?? 4096,
          tickIntervalSeconds: Math.max(agentDef.tickIntervalSeconds ?? 300, 300),
          labels: (agentDef.labels ?? []).join(","),
          subordinates: (agentDef.subordinates ?? []).join(","),
        },
        create: {
          companyId,
          agentId: agentDef.agentId,
          role: agentDef.role,
          context: agentDef.context,
          providerId: provider.id,
          model: agentDef.llm.model,
          temperature: agentDef.llm.temperature ?? 0.2,
          maxTokens: agentDef.llm.maxTokens ?? 4096,
          tickIntervalSeconds: Math.max(agentDef.tickIntervalSeconds ?? 300, 300),
          labels: (agentDef.labels ?? []).join(","),
          subordinates: (agentDef.subordinates ?? []).join(","),
          isCeo: agentDef.agentId === "ceo",
        },
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
