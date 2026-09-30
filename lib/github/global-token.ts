// lib/github/global-token.ts
//
// Single Responsibility: gerenciar o token GitHub GLOBAL (write-only) usado
// pela aplicação e pela CLI. Guardado no tenant de sistema como GITHUB_TOKEN.

import { prisma } from "../db/client";
import { getSystemCompanyId } from "../db/system-tenant";
import { upsertSecret } from "../db/secrets";

export const GLOBAL_GITHUB_TOKEN_KEY = "GITHUB_TOKEN";

/** Retorna o token GitHub global (uso server-side apenas). */
export async function getGlobalGitHubToken(): Promise<string | null> {
  const systemId = await getSystemCompanyId();
  const secret = await prisma.companySecret.findFirst({
    where: { companyId: systemId, key: GLOBAL_GITHUB_TOKEN_KEY },
    select: { value: true },
  });
  return secret?.value ?? null;
}

/** Grava/atualiza o token GitHub global (write-only). */
export async function setGlobalGitHubToken(value: string): Promise<void> {
  const systemId = await getSystemCompanyId();
  await upsertSecret(systemId, GLOBAL_GITHUB_TOKEN_KEY, value);
}

/** Indica se o token global está configurado (sem revelar o valor). */
export async function hasGlobalGitHubToken(): Promise<boolean> {
  return (await getGlobalGitHubToken()) !== null;
}
