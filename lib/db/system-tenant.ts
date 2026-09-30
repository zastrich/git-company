// lib/db/system-tenant.ts
//
// Single Responsibility: fornecer um "tenant de sistema" para guardar
// credenciais globais de LLM que existem ANTES de qualquer projeto.
//
// Providers de IA são globais (catálogo). As API keys, porém, são secrets
// por-tenant no schema. Para permitir configurar LLMs antes de criar projetos,
// guardamos as chaves globais neste tenant reservado. O buildLLMForProvider
// usa essas chaves como fallback quando um projeto não tem a sua própria.

import { prisma } from "./client";
import crypto from "crypto";

export const SYSTEM_SLUG = "__system__";

/**
 * Garante que o tenant de sistema exista e retorna seu id.
 */
export async function getSystemCompanyId(): Promise<string> {
  const existing = await prisma.company.findUnique({ where: { slug: SYSTEM_SLUG } });
  if (existing) return existing.id;

  const created = await prisma.company.create({
    data: {
      name: "Configuração Global",
      slug: SYSTEM_SLUG,
      repoPrefix: "",
      githubOwner: "",
      githubToken: "",
      webhookSecret: crypto.randomUUID(),
      repoName: "",
      mission: "Tenant reservado para credenciais globais de LLM.",
    },
  });
  return created.id;
}
