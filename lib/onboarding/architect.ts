// lib/onboarding/architect.ts
//
// Single Responsibility: usar uma LLM já configurada como "arquiteto de projeto"
// para transformar uma descrição em linguagem natural em um PLANO DE PROJETO
// estruturado (etapas/colunas do board, labels, agentes/colaboradores e ciclo
// de vida das issues).
//
// Reusa a mesma resolução de provider/secret do chat (via buildLLMForProvider).

import { prisma } from "../db/client";
import { createLLM } from "../agents/llm-factory";
import { providerSecretKey } from "../db/secrets";
import { getSystemCompanyId } from "../db/system-tenant";
import { LLMConfig } from "../baac/types";
import { SystemMessage, HumanMessage } from "@langchain/core/messages";

// ─────────────────────────────────────────────
// Tipos do plano de projeto proposto pela LLM
// ─────────────────────────────────────────────

export interface PlanColumn {
  name: string;
  description?: string;
  isManualAction?: boolean;
  isDone?: boolean;
}

export interface PlanLabel {
  name: string;
  color: string; // hex sem #
  description: string;
}

export interface PlanAgent {
  agentId: string;
  role: string;
  type: "ai" | "human";
  context: string;
  labels: string[];
  subordinates?: string[];
  isCeo?: boolean;
  githubUsername?: string;
}

export interface ProjectPlan {
  companyName: string;
  slug: string;
  mission: string;
  repoPrefix: string;
  columns: PlanColumn[];
  labels: PlanLabel[];
  agents: PlanAgent[];
  completionPatterns: string[];
}

// ─────────────────────────────────────────────
// Resolução de LLM a partir de um provider do catálogo
// ─────────────────────────────────────────────

const FIXED_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  bedrock: "AWS_BEDROCK_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
  ollama: "",
  local: "",
};

/**
 * Cria uma LLM a partir de um provider (slug) + model, resolvendo a API key
 * na base de secrets do tenant informado (write-only continua respeitado:
 * o valor só é lido server-side aqui, nunca retornado).
 *
 * companyId é opcional — quando ausente (onboarding do zero), usa o secret
 * global do primeiro tenant que tiver a chave, permitindo bootstrap.
 */
export async function buildLLMForProvider(
  providerSlug: string,
  model: string,
  secretsCompanyId?: string
): Promise<ReturnType<typeof createLLM>> {
  const provider = await prisma.aIProvider.findUnique({ where: { slug: providerSlug } });
  if (!provider) throw new Error(`Provider "${providerSlug}" não encontrado.`);

  const secretKey =
    provider.type === "custom"
      ? providerSecretKey(provider.slug)
      : (FIXED_KEY_MAP[provider.type] ?? "");

  let apiKey: string | undefined;
  if (secretKey) {
    // 1. tenta o secret do projeto informado; 2. cai no tenant de sistema (global).
    if (secretsCompanyId) {
      const own = await prisma.companySecret.findFirst({
        where: { companyId: secretsCompanyId, key: secretKey },
      });
      apiKey = own?.value;
    }
    if (!apiKey) {
      const systemId = await getSystemCompanyId();
      const global = await prisma.companySecret.findFirst({
        where: { companyId: systemId, key: secretKey },
      });
      apiKey = global?.value;
    }
  }

  const llmConfig: LLMConfig = {
    provider: provider.type as LLMConfig["provider"],
    model,
    apiKey,
    baseUrl: provider.baseUrl ?? undefined,
    temperature: 0.4,
    maxTokens: 2048,
  };

  return createLLM(llmConfig);
}

// ─────────────────────────────────────────────
// Plano default (fallback determinístico, sem LLM)
// ─────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function defaultPlan(description: string, companyName: string): ProjectPlan {
  const slug = slugify(companyName) || "meu-projeto";
  return {
    companyName,
    slug,
    mission: description.slice(0, 200),
    repoPrefix: `${slug.slice(0, 8)}-`,
    columns: [
      { name: "Backlog", description: "Itens aguardando priorização" },
      { name: "Em Progresso", description: "Sendo trabalhado" },
      { name: "Revisão", description: "Aguardando revisão" },
      { name: "Ação Manual", description: "Requer ação humana", isManualAction: true },
      { name: "Concluído", description: "Finalizado", isDone: true },
    ],
    labels: [
      { name: "prioridade-alta", color: "d73a4a", description: "Urgente e importante" },
      { name: "prioridade-media", color: "fbca04", description: "Importante" },
      { name: "prioridade-baixa", color: "0e8a16", description: "Pode esperar" },
    ],
    agents: [
      {
        agentId: "ceo",
        role: "Coordenador",
        type: "ai",
        context: `Você coordena o projeto: ${description}. Prioriza tarefas e delega.`,
        labels: ["prioridade-alta"],
        isCeo: true,
      },
    ],
    completionPatterns: ["[TAREFA_CONCLUÍDA]", "[TASK_COMPLETED]"],
  };
}

// ─────────────────────────────────────────────
// Geração do plano via LLM
// ─────────────────────────────────────────────

const ARCHITECT_SYSTEM = `Você é um arquiteto de projetos que estrutura o trabalho de uma equipe (humanos + agentes de IA) dentro de um board estilo GitHub Projects / Trello.

A partir da descrição do usuário, gere um PLANO em JSON VÁLIDO (e nada além do JSON), no formato exato:
{
  "companyName": "string curto",
  "slug": "kebab-case-unico",
  "mission": "1-2 frases",
  "repoPrefix": "prefixo-curto-",
  "columns": [{"name":"...","description":"...","isManualAction":false,"isDone":false}],
  "labels": [{"name":"kebab-case","color":"hex-sem-#","description":"..."}],
  "agents": [{"agentId":"kebab","role":"...","type":"ai|human","context":"escopo/instruções","labels":["..."],"subordinates":[],"isCeo":false,"githubUsername":""}],
  "completionPatterns": ["[TAREFA_CONCLUÍDA]"]
}

REGRAS:
- Responda SOMENTE com o JSON, sem cercas de código, sem texto antes/depois.
- Defina de 4 a 6 colunas representando o fluxo do trabalho, incluindo uma coluna de ação manual e uma de concluído.
- Defina labels úteis (prioridade, áreas/tipos de tarefa).
- Defina de 2 a 5 agentes/colaboradores coerentes com o projeto. Marque exatamente um como "isCeo": true (o coordenador). Use type "human" para papéis que devem ser feitos por pessoas.
- context de cada agente deve ser um escopo operacional claro em português.
- slug e agentId em kebab-case, sem acentos.`;

/**
 * Extrai o primeiro bloco JSON de um texto (tolerante a cercas de código).
 */
export function extractJson(text: string): string {
  let t = text.trim();
  // remove cercas ```json ... ```
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  // pega do primeiro { ao último }
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

function coercePlan(raw: any, description: string): ProjectPlan {
  const fallback = defaultPlan(description, raw?.companyName ?? "Meu Projeto");
  return {
    companyName: typeof raw?.companyName === "string" ? raw.companyName : fallback.companyName,
    slug: (typeof raw?.slug === "string" ? slugify(raw.slug) : "") || fallback.slug,
    mission: typeof raw?.mission === "string" ? raw.mission : fallback.mission,
    repoPrefix: typeof raw?.repoPrefix === "string" ? raw.repoPrefix : fallback.repoPrefix,
    columns: Array.isArray(raw?.columns) && raw.columns.length ? raw.columns : fallback.columns,
    labels: Array.isArray(raw?.labels) && raw.labels.length ? raw.labels : fallback.labels,
    agents: Array.isArray(raw?.agents) && raw.agents.length
      ? raw.agents.map((a: any) => ({
          agentId: slugify(a?.agentId ?? a?.role ?? "agente"),
          role: a?.role ?? "Colaborador",
          type: a?.type === "human" ? "human" : "ai",
          context: a?.context ?? "",
          labels: Array.isArray(a?.labels) ? a.labels : [],
          subordinates: Array.isArray(a?.subordinates) ? a.subordinates : [],
          isCeo: Boolean(a?.isCeo),
          githubUsername: a?.githubUsername ?? "",
        }))
      : fallback.agents,
    completionPatterns: Array.isArray(raw?.completionPatterns) && raw.completionPatterns.length
      ? raw.completionPatterns
      : fallback.completionPatterns,
  };
}

/**
 * Gera um plano de projeto a partir de uma descrição, usando a LLM indicada.
 * Se a LLM falhar ou retornar JSON inválido, cai no plano default.
 */
export async function generateProjectPlan(params: {
  description: string;
  providerSlug: string;
  model: string;
  secretsCompanyId?: string;
}): Promise<{ plan: ProjectPlan; source: "llm" | "fallback"; raw?: string }> {
  const { description, providerSlug, model, secretsCompanyId } = params;

  try {
    const llm = await buildLLMForProvider(providerSlug, model, secretsCompanyId);
    const res = await llm.invoke([
      new SystemMessage(ARCHITECT_SYSTEM),
      new HumanMessage(`Descrição do projeto:\n${description}`),
    ]);
    const text = typeof res.content === "string" ? res.content : JSON.stringify(res.content);
    const jsonStr = extractJson(text);
    const parsed = JSON.parse(jsonStr);
    return { plan: coercePlan(parsed, description), source: "llm", raw: text };
  } catch (err: any) {
    // Fallback determinístico — nunca deixa o onboarding travado.
    return {
      plan: defaultPlan(description, "Meu Projeto"),
      source: "fallback",
      raw: err?.message,
    };
  }
}
