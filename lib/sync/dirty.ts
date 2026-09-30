// lib/sync/dirty.ts
//
// Single Responsibility: rastrear se a configuração local de um projeto
// divergiu do que está no GitHub (precisa de push). Usa CompanyConfig como
// armazenamento simples (key "sync_dirty").

import { prisma } from "../db/client";

const DIRTY_KEY = "sync_dirty";

/** Marca o projeto como "pendente de sincronização" (após alteração local). */
export async function markDirty(companyId: string): Promise<void> {
  await prisma.companyConfig.upsert({
    where: { companyId_key: { companyId, key: DIRTY_KEY } },
    update: { value: new Date().toISOString() },
    create: { companyId, key: DIRTY_KEY, value: new Date().toISOString() },
  });
}

/** Limpa a flag (após um push bem-sucedido). */
export async function clearDirty(companyId: string): Promise<void> {
  await prisma.companyConfig.deleteMany({ where: { companyId, key: DIRTY_KEY } });
}

/** Retorna o timestamp da última alteração pendente, ou null se sincronizado. */
export async function getDirtySince(companyId: string): Promise<string | null> {
  const row = await prisma.companyConfig.findUnique({
    where: { companyId_key: { companyId, key: DIRTY_KEY } },
    select: { value: true },
  });
  return row?.value ?? null;
}
