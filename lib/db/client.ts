// lib/db/client.ts
// Singleton do PrismaClient — usado por toda a aplicação.
// Evita múltiplas instâncias em hot-reload do Next.js.

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
