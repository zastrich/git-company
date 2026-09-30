#!/usr/bin/env -S npx tsx
// scheduler/index.ts
//
// Entrypoint do processo scheduler. Executa em Node via tsx
// (cross-platform: Windows, macOS, Linux).
// Uso:
//   npx tsx scheduler/index.ts --company=acme-corp
//   npx tsx scheduler/index.ts --company=acme-corp --agent=dev-agent
//   npx tsx scheduler/index.ts --company=acme-corp --run-now
//
// IMPORTANTE: garantimos DATABASE_URL ANTES de qualquer import que carregue o
// Prisma. Por isso a SchedulerService é importada dinamicamente dentro de main(),
// depois de ensureDatabaseUrl(). Assim o processo funciona tanto no clone/dev
// quanto no modo npx (onde o banco fica em ~/.gitcompany/main.db).

import fs from "fs";
import path from "path";
import { ensureDatabaseUrl, projectRoot } from "../lib/runtime-paths";

function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val ?? true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const companySlug = args["company"] as string | undefined;

  if (!companySlug) {
    console.error("[Scheduler] --company=<slug> é obrigatório.");
    process.exit(1);
  }

  // Define DATABASE_URL (respeita o que já vier do ambiente) antes de tocar no Prisma.
  ensureDatabaseUrl();

  // Garante o @prisma/client GERADO antes de qualquer import do Prisma.
  // No modo npx, o client da raiz do pacote não é gerado ("did not initialize
  // yet"). O client gerado (com engines) vem embutido no bundle standalone;
  // copiamos .prisma/client e @prisma/client de lá para a raiz do pacote de
  // forma idempotente, para o bare import "@prisma/client" resolver o correto.
  ensureGeneratedPrismaClient();

  // Import dinâmico: só agora a cadeia do Prisma é carregada, já com DATABASE_URL setado.
  const { SchedulerService } = await import("../lib/scheduler/scheduler-service");
  const scheduler = new SchedulerService();

  await scheduler.start({
    companySlug,
    agentId: args["agent"] as string | undefined,
    runOnce: args["run-now"] === true,
  });
}

/**
 * Copia (idempotente) o Prisma client gerado do bundle standalone para o
 * node_modules da raiz do pacote, caso o client da raiz não esteja gerado.
 * Necessário no modo npx; no clone/dev normalmente já existe e nada é feito.
 */
function ensureGeneratedPrismaClient(): void {
  try {
    const root = projectRoot();
    const rootDotPrisma = path.join(root, "node_modules", ".prisma", "client");
    // Se já existir um engine gerado na raiz, nada a fazer.
    const hasEngine =
      fs.existsSync(rootDotPrisma) &&
      fs.readdirSync(rootDotPrisma).some((f) => /engine|\.node$|\.dll|\.so|\.dylib/i.test(f));
    if (hasEngine) return;

    const saRoot = path.join(root, ".next", "standalone", "node_modules");
    const srcDotPrisma = path.join(saRoot, ".prisma", "client");
    const srcAtPrisma = path.join(saRoot, "@prisma", "client");
    if (!fs.existsSync(srcDotPrisma)) return; // sem bundle standalone (clone/dev)

    const copyDir = (src: string, dest: string) => {
      if (!fs.existsSync(src)) return;
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDir(s, d);
        else fs.copyFileSync(s, d);
      }
    };

    copyDir(srcDotPrisma, rootDotPrisma);
    copyDir(srcAtPrisma, path.join(root, "node_modules", "@prisma", "client"));
    console.log("[Scheduler] Prisma client gerado sincronizado do bundle standalone.");
  } catch (e) {
    console.warn("[Scheduler] aviso ao sincronizar Prisma client:", (e as Error).message);
  }
}

main().catch((err) => {
  console.error("[Scheduler] Fatal:", err.message);
  process.exit(1);
});
