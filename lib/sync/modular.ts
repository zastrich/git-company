// lib/sync/modular.ts
//
// Estrutura MODULAR do business.json no repositório:
//
//   business.json        → índice (nome, missão, versão, refs)
//   agents/<agentId>.json → um arquivo por agente (detalhe completo)
//   workflow.json        → fluxo do projeto: etapas com contexto de
//                          input/output por etapa (system-prompt-like)
//
// Objetivo: evitar um único arquivo gigante e dar mais detalhe por agente
// e por etapa. Mantém retrocompatibilidade: se só existir o business.json
// monolítico (formato antigo), o pull ainda funciona.

import { Octokit } from "@octokit/rest";
import { BusinessConfig, AgentDefinition } from "../baac/types";

// ─────────────────────────────────────────────
// Tipos modulares
// ─────────────────────────────────────────────

/** Contexto de uma etapa do fluxo: o que entra e o que sai. */
export interface WorkflowStage {
  name: string;
  description?: string;
  isManualAction?: boolean;
  isDone?: boolean;
  /** O que o agente recebe ao pegar um card nesta etapa. */
  input?: string;
  /** O que o agente deve produzir para avançar o card. */
  output?: string;
}

export interface WorkflowFile {
  version: string;
  stages: WorkflowStage[];
  completionPatterns: string[];
}

/** Índice raiz (business.json modular). */
export interface BusinessIndex {
  companyName: string;
  mission?: string;
  version: string;
  /** modo modular */
  modular: true;
  /** caminhos relativos dos arquivos de agente */
  agentRefs: { agentId: string; path: string }[];
  /** caminho do arquivo de fluxo */
  workflowRef: string;
  /** orgChart resumido permanece inline (é pequeno e útil) */
  orgChart?: BusinessConfig["orgChart"];
  repos?: BusinessConfig["repos"];
}

function b64(s: string) { return Buffer.from(s).toString("base64"); }

async function putFile(octokit: Octokit, owner: string, repo: string, path: string, content: string, message: string) {
  let sha: string | undefined;
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (!Array.isArray(data) && (data as any).type === "file") sha = (data as any).sha;
  } catch { /* não existe */ }
  await octokit.rest.repos.createOrUpdateFileContents({
    owner, repo, path, message, content: b64(content), sha,
  });
}

async function getJson<T>(octokit: Octokit, owner: string, repo: string, path: string): Promise<T | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
    if (Array.isArray(data) || (data as any).type !== "file") return null;
    const text = Buffer.from((data as any).content, "base64").toString("utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// PUSH modular
// ─────────────────────────────────────────────

/**
 * Escreve a estrutura modular no repositório a partir de um BusinessConfig
 * já construído localmente (buildLocalBusinessJson).
 */
export async function pushModular(
  token: string,
  owner: string,
  repo: string,
  business: BusinessConfig
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  // 1. um arquivo por agente
  const agentRefs: { agentId: string; path: string }[] = [];
  for (const agent of business.agents) {
    const path = `agents/${agent.agentId}.json`;
    agentRefs.push({ agentId: agent.agentId, path });
    await putFile(octokit, owner, repo, path, JSON.stringify(agent, null, 2), `Sync: agent ${agent.agentId}`);
  }

  // 2. workflow.json com contexto por etapa
  const stages: WorkflowStage[] = (business.infrastructure?.project?.columns ?? []).map((c) => ({
    name: c.name,
    description: c.description,
    isManualAction: c.isManualAction,
    isDone: c.isDone,
    input: `Contexto de entrada para a etapa "${c.name}": leia o card, comentários e issues relacionadas.`,
    output: `Saída esperada na etapa "${c.name}": atualize o card e mova para a próxima etapa quando concluir.`,
  }));
  const workflow: WorkflowFile = {
    version: "1.0",
    stages,
    completionPatterns: business.infrastructure?.issueLifecycle?.completionPatterns ?? ["[TAREFA_CONCLUÍDA]"],
  };
  await putFile(octokit, owner, repo, "workflow.json", JSON.stringify(workflow, null, 2), "Sync: workflow");

  // 3. índice business.json
  const index: BusinessIndex = {
    companyName: business.companyName,
    mission: business.mission,
    version: business.version,
    modular: true,
    agentRefs,
    workflowRef: "workflow.json",
    orgChart: business.orgChart,
    repos: business.repos,
  };
  await putFile(octokit, owner, repo, "business.json", JSON.stringify(index, null, 2), "Sync: business.json (index)");
}

// ─────────────────────────────────────────────
// PULL modular (com fallback ao formato monolítico)
// ─────────────────────────────────────────────

/**
 * Lê a estrutura remota. Se business.json for um índice modular, monta o
 * BusinessConfig a partir dos arquivos referenciados. Caso contrário, assume
 * o formato monolítico antigo e o devolve como está.
 */
export async function pullModular(
  token: string,
  owner: string,
  repo: string
): Promise<BusinessConfig | null> {
  const octokit = new Octokit({ auth: token });

  const root = await getJson<any>(octokit, owner, repo, "business.json");
  if (!root) return null;

  // Formato antigo (monolítico): tem "agents" inline e não é modular.
  if (!root.modular) {
    return root as BusinessConfig;
  }

  const index = root as BusinessIndex;

  // Carrega cada agente
  const agents: AgentDefinition[] = [];
  for (const ref of index.agentRefs ?? []) {
    const agent = await getJson<AgentDefinition>(octokit, owner, repo, ref.path);
    if (agent) agents.push(agent);
  }

  // Carrega workflow
  const workflow = await getJson<WorkflowFile>(octokit, owner, repo, index.workflowRef ?? "workflow.json");
  const columns = (workflow?.stages ?? []).map((s) => ({
    name: s.name,
    description: s.description,
    isManualAction: s.isManualAction,
    isDone: s.isDone,
  }));

  const business: BusinessConfig = {
    companyName: index.companyName,
    mission: index.mission,
    version: index.version ?? "1.0",
    agents,
    infrastructure: {
      labels: [],
      milestones: [],
      project: { title: `${index.companyName} — Board`, views: [], columns },
      workflows: [],
      issueLifecycle: workflow
        ? {
            completionPatterns: workflow.completionPatterns,
            completionColumn: columns.find((c) => c.isDone)?.name ?? "Concluído",
            autoClose: true,
            defaultColumn: columns[0]?.name ?? "Backlog",
            manualActionColumn: columns.find((c) => c.isManualAction)?.name ?? "Ação Manual",
          }
        : undefined,
    },
    orgChart: index.orgChart,
    repos: index.repos,
  };

  return business;
}
