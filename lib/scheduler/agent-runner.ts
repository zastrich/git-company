// lib/scheduler/agent-runner.ts
// Single Responsibility: Execute a single agent tick cycle.

import { AgentConfig, AIProvider } from "@prisma/client";
import { LLMConfig, AgentDefinition } from "../baac/types";
import { runAgentCycle } from "../agents/orchestrator";
import { prisma } from "../db/client";
import { applySecrets } from "../db/secrets";
import { BusinessConfig } from "../baac/types";
import { Octokit } from "@octokit/rest";

export interface AgentRunResult {
  agentId: string;
  processed: number;
  blocked: number;
  errors: number;
}

/**
 * Converte um AgentConfig do banco + AIProvider em um AgentDefinition compatível com o orchestrator.
 * Retorna null para human agents (não executáveis por LLM).
 */
export function toAgentDefinition(
  agentConfig: AgentConfig & { provider: AIProvider | null },
  secrets: Map<string, string>
): AgentDefinition | null {
  // Human agents não rodam via LLM
  if (agentConfig.type === "human" || !agentConfig.provider) {
    return null;
  }

  const provider = agentConfig.provider;

  // Resolver a API key do provider via secrets
  const providerKeyMap: Record<string, string> = {
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    gemini: "GEMINI_API_KEY",
    bedrock: "AWS_BEDROCK_KEY",
    moonshot: "MOONSHOT_API_KEY",
    groq: "GROQ_API_KEY",
    ollama: "",
  };

  const secretKey = providerKeyMap[provider.type] ?? "";
  const apiKey = secretKey ? (secrets.get(secretKey) ?? "") : undefined;

  const llmConfig: LLMConfig = {
    provider: provider.type as LLMConfig["provider"],
    model: agentConfig.model,
    apiKey,
    baseUrl: provider.baseUrl ?? undefined,
    temperature: agentConfig.temperature,
    maxTokens: agentConfig.maxTokens,
  };

  return {
    agentId: agentConfig.agentId,
    role: agentConfig.role,
    type: (agentConfig.type ?? "ai") as "ai" | "human",
    llm: llmConfig,
    context: agentConfig.context,
    tickIntervalSeconds: agentConfig.tickIntervalSeconds,
    labels: agentConfig.labels ? agentConfig.labels.split(",").map((l) => l.trim()).filter(Boolean) : [],
    subordinates: agentConfig.subordinates ? agentConfig.subordinates.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
  };
}

/**
 * Carrega o business.json de um repositório remoto.
 */
export async function loadBusinessConfig(
  token: string,
  owner: string,
  repo: string
): Promise<BusinessConfig> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.repos.getContent({
    owner,
    repo,
    path: "business.json",
  });

  if (Array.isArray(data) || data.type !== "file") {
    throw new Error("business.json não encontrado ou é um diretório.");
  }

  const content = Buffer.from(data.content, "base64").toString("utf-8");
  return JSON.parse(content) as BusinessConfig;
}

/**
 * Executa um único agente — carrega config do banco, busca secrets, roda o ciclo.
 * Retorna resultado vazio para human agents (não executáveis).
 */
export async function executeAgentTick(
  agentConfig: AgentConfig & { provider: AIProvider | null },
  companyId: string,
  token: string,
  owner: string,
  repo: string
): Promise<AgentRunResult> {
  // Human agents não rodam via LLM
  if (agentConfig.type === "human" || !agentConfig.provider) {
    return { agentId: agentConfig.agentId, processed: 0, blocked: 0, errors: 0 };
  }

  const secrets = await prisma.companySecret.findMany({
    where: { companyId },
    select: { key: true, value: true },
  });
  const secretsMap = new Map(secrets.map((s) => [s.key, s.value]));

  const agentDef = toAgentDefinition(agentConfig, secretsMap);
  if (!agentDef) {
    return { agentId: agentConfig.agentId, processed: 0, blocked: 0, errors: 0 };
  }

  // Carregar business.json para ter context do orchestrator
  let businessConfig: BusinessConfig;
  try {
    businessConfig = await loadBusinessConfig(token, owner, repo);
    businessConfig = await applySecrets(companyId, businessConfig);
  } catch {
    // Fallback: config mínima
    businessConfig = {
      companyName: "",
      version: "1.0",
      agents: [agentDef],
      infrastructure: { labels: [], milestones: [], project: { title: "", views: [], columns: [] }, workflows: [] },
    };
  }

  return await runAgentCycle(agentDef, businessConfig, companyId, token, owner, repo);
}
