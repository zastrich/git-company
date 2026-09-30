// lib/onboarding/import.ts
//
// Single Responsibility: importar um projeto existente a partir do business.json
// de um repositório GitHub, reconstituindo o estado local necessário para uma
// máquina participar do projeto (trabalho paralelo multi-máquina).
//
// Fluxo:
//   1. lê business.json remoto (reusa org-sync.fetchRemoteBusinessJson);
//   2. cria a Company local (se ainda não existir);
//   3. popula agentes localmente (reusa org-sync.pullFromRemote);
//   4. garante que os AIProviders referenciados existam (cria os que faltam);
//   5. reporta quais SECRETS faltam nesta máquina (nunca lê valores remotos).

import { prisma } from "../db/client";
import { pullFromRemote } from "../sync/org-sync";
import { pullModular } from "../sync/modular";
import { providerSecretKey } from "../db/secrets";
import { validateToken } from "../github/token-validator";
import { createAuditLog } from "../db/audit";
import { LLMProvider } from "../baac/types";
import crypto from "crypto";

export interface MissingSecret {
  key: string;
  providerType: string;
  reason: string;
}

export interface UnresolvedProvider {
  /** agentes afetados por este provider indisponível */
  agentIds: string[];
  /** slug/tipo referenciado no business.json que não está disponível localmente */
  referenced: string;
  providerType: string;
  reason: string;
}

export interface ImportResult {
  companyId: string;
  slug: string;
  name: string;
  agentsImported: number;
  providersEnsured: string[];
  missingSecrets: MissingSecret[];
  unresolvedProviders: UnresolvedProvider[];
  availableProviders: { slug: string; name: string; type: string }[];
  reused: boolean;
}

/** Mapa fixo de chave de secret esperada por tipo de provider (não-custom). */
const FIXED_KEY_MAP: Partial<Record<LLMProvider, string>> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  bedrock: "AWS_BEDROCK_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
};

/** Nome amigável default para um provider recém-criado a partir do type. */
function providerNameFor(type: string): string {
  const map: Record<string, string> = {
    openai: "OpenAI (ChatGPT)",
    anthropic: "Anthropic (Claude)",
    gemini: "Google (Gemini)",
    bedrock: "AWS Bedrock",
    moonshot: "Moonshot (Kimi K3)",
    groq: "Groq",
    ollama: "Ollama (Local)",
    local: "Organizador Local (Básico)",
    custom: "Custom (OpenAI-compatible)",
  };
  return map[type] ?? type;
}

/**
 * Importa um projeto existente. Requer token GitHub válido para ler o repo.
 */
export async function importFromRepo(params: {
  token: string;
  owner: string;
  repo: string;
}): Promise<ImportResult> {
  const { token, owner, repo } = params;

  // 0. Validar token
  const validation = await validateToken(token);
  if (!validation.valid) {
    throw new Error(`Token GitHub inválido: ${validation.message}`);
  }

  // 1. Ler business.json remoto (modular ou monolítico)
  const business = await pullModular(token, owner, repo);
  if (!business?.companyName) {
    throw new Error("business.json remoto não encontrado ou sem companyName.");
  }

  const slug = slugify(business.companyName);

  // 2. Criar (ou reusar) Company local
  let company = await prisma.company.findUnique({ where: { slug } });
  const reused = Boolean(company);

  if (!company) {
    company = await prisma.company.create({
      data: {
        name: business.companyName,
        slug,
        repoPrefix: inferPrefix(repo),
        githubOwner: owner,
        githubToken: token,
        webhookSecret: crypto.randomUUID(),
        repoName: repo,
        mission: business.mission ?? "",
      },
    });
  } else {
    // Atualiza credenciais/aponta para o repo importado nesta máquina.
    company = await prisma.company.update({
      where: { id: company.id },
      data: { githubToken: token, githubOwner: owner, repoName: repo },
    });
  }

  // 3. Reconciliar providers referenciados pelos agentes
  const providersEnsured: string[] = [];
  const agentDefs = business.agents ?? [];

  // tipos do catálogo que podem ser criados automaticamente com segurança
  const KNOWN_TYPES = new Set(["openai", "anthropic", "gemini", "bedrock", "moonshot", "groq", "ollama", "local"]);

  const unresolvedMap = new Map<string, UnresolvedProvider>();

  for (const agent of agentDefs) {
    if (agent.type === "human") continue;
    const type = agent.llm?.provider;
    if (!type) continue;

    const slugForProvider =
      type === "custom" ? customSlugFromBaseUrl(agent.llm?.baseUrl) : type;

    const existing = await prisma.aIProvider.findUnique({ where: { slug: slugForProvider } });
    if (existing) continue;

    if (type === "custom" && agent.llm?.baseUrl) {
      // custom com baseUrl: podemos criar o catálogo, mas a credencial faltará
      await prisma.aIProvider.create({
        data: {
          name: providerNameFor(type),
          slug: slugForProvider,
          type,
          baseUrl: agent.llm.baseUrl,
          isLocal: false,
        },
      });
      providersEnsured.push(slugForProvider);
    } else if (KNOWN_TYPES.has(type)) {
      await prisma.aIProvider.create({
        data: {
          name: providerNameFor(type),
          slug: slugForProvider,
          type,
          baseUrl: agent.llm?.baseUrl ?? null,
          isLocal: type === "ollama" || type === "local",
        },
      });
      providersEnsured.push(slugForProvider);
    } else {
      // Indisponível e não criável com segurança → precisa de remapeamento humano.
      const cur = unresolvedMap.get(slugForProvider) ?? {
        agentIds: [],
        referenced: slugForProvider,
        providerType: type,
        reason: `A LLM "${slugForProvider}" (${type}) referenciada não está disponível nesta máquina. Escolha uma LLM disponível.`,
      };
      cur.agentIds.push(agent.agentId);
      unresolvedMap.set(slugForProvider, cur);
    }
  }

  const unresolvedProviders = Array.from(unresolvedMap.values());

  // 4. Popular agentes localmente (reusa pull do org-sync)
  await pullFromRemote(company.id);
  const agentsImported = await prisma.agentConfig.count({ where: { companyId: company.id } });

  // 5. Reportar secrets faltantes (nunca lê valores remotos)
  const localSecrets = await prisma.companySecret.findMany({
    where: { companyId: company.id },
    select: { key: true },
  });
  const haveKeys = new Set(localSecrets.map((s) => s.key));

  const missingSecrets: MissingSecret[] = [];
  const seenKeys = new Set<string>();

  for (const agent of agentDefs) {
    if (agent.type === "human") continue;
    const type = agent.llm?.provider;
    if (!type || type === "ollama" || type === "local") continue;

    const slugForProvider =
      type === "custom" ? customSlugFromBaseUrl(agent.llm?.baseUrl) : type;
    const key =
      type === "custom" ? providerSecretKey(slugForProvider) : (FIXED_KEY_MAP[type] ?? "");

    if (!key || seenKeys.has(key)) continue;
    seenKeys.add(key);

    if (!haveKeys.has(key)) {
      missingSecrets.push({
        key,
        providerType: type,
        reason: `Necessário para o provider "${slugForProvider}" usado por agentes deste projeto.`,
      });
    }
  }

  const available = await prisma.aIProvider.findMany({ orderBy: { name: "asc" } });

  await createAuditLog({
    companyId: company.id,
    agentName: "Onboarding",
    action: "PROJECT_IMPORTED",
    details: {
      agents: agentsImported,
      missingSecrets: missingSecrets.length,
      unresolved: unresolvedProviders.length,
      reused,
    },
  });

  return {
    companyId: company.id,
    slug: company.slug,
    name: company.name,
    agentsImported,
    providersEnsured,
    missingSecrets,
    unresolvedProviders,
    availableProviders: available.map((p) => ({ slug: p.slug, name: p.name, type: p.type })),
    reused,
  };
}

// ─────────────────────────────────────────────
// Helpers
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

/** Deriva um prefixo a partir do nome do repo (ex: "comp-org" -> "comp-"). */
function inferPrefix(repo: string): string {
  const m = repo.match(/^(.*?-)org$/);
  return m ? m[1] : "";
}

/** Deriva um slug estável para provider custom a partir do host do baseUrl. */
function customSlugFromBaseUrl(baseUrl?: string): string {
  if (!baseUrl) return "custom";
  try {
    const host = new URL(baseUrl).hostname; // ex: integrate.api.nvidia.com
    const core = host.split(".").slice(-2, -1)[0] ?? host; // "nvidia"
    return slugify(core) || "custom";
  } catch {
    return "custom";
  }
}
