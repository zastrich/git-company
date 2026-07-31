// lib/db/secrets.ts
import { prisma } from "./client";

/**
 * Carrega todos os secrets de um tenant do SQLite.
 */
export async function getSecrets(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.companySecret.findMany({
    where: { companyId },
    select: { key: true, value: true },
  });

  return new Map(rows.map((r) => [r.key, r.value]));
}

/**
 * Interpola secrets em qualquer valor string do objeto,
 * substituindo {{CHAVE}} pelo valor correspondente do banco.
 * Funciona recursivamente em objetos e arrays.
 * NUNCA loga os valores de secrets.
 */
export function interpolateSecrets<T>(config: T, secrets: Map<string, string>): T {
  if (typeof config === "string") {
    return config.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_, key) => {
      const value = secrets.get(key);
      if (!value) {
        console.warn(`[Secrets] Placeholder {{${key}}} não encontrado no banco de secrets.`);
        return `{{${key}}}`;
      }
      return value;
    }) as T;
  }

  if (Array.isArray(config)) {
    return config.map((item) => interpolateSecrets(item, secrets)) as T;
  }

  if (config !== null && typeof config === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config as Record<string, unknown>)) {
      result[k] = interpolateSecrets(v, secrets);
    }
    return result as T;
  }

  return config;
}

/**
 * Helper: carrega e interpola o business.json de um tenant em uma só chamada.
 */
export async function applySecrets<T>(companyId: string, config: T): Promise<T> {
  const secrets = await getSecrets(companyId);
  return interpolateSecrets(config, secrets);
}

/**
 * Salvar ou atualizar um secret no banco.
 */
export async function upsertSecret(
  companyId: string,
  key: string,
  value: string
): Promise<void> {
  await prisma.companySecret.upsert({
    where: { companyId_key: { companyId, key } },
    update: { value },
    create: { companyId, key, value },
  });
}
