// lib/runtime-paths.ts
//
// Resolve caminhos de runtime de forma consistente entre os dois modos de uso:
//   1) Clone/dev: rodando dentro do repositório (banco em ./main.db via .env)
//   2) npx/global: instalado como pacote npm (banco em ~/.gitcompany/main.db)
//
// A regra do banco:
//   - Se DATABASE_URL já estiver definido no ambiente, respeita (não sobrescreve).
//   - Senão, usa o diretório de dados do usuário (~/.gitcompany).
//
// O binário (bin/cli.js) chama ensureDatabaseUrl() ANTES de qualquer import do
// Prisma para garantir que o cliente conecte no banco certo.

import os from "os";
import path from "path";
import fs from "fs";

/** Diretório de dados do usuário para o GitCompany (~/.gitcompany). */
export function dataDir(): string {
  const dir = path.join(os.homedir(), ".gitcompany");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/** Caminho absoluto do arquivo SQLite no diretório de dados do usuário. */
export function homeDbPath(): string {
  return path.join(dataDir(), "main.db");
}

/**
 * Garante que process.env.DATABASE_URL esteja definido.
 * - Respeita um valor já existente (ex.: .env em clone/dev, ou override do usuário).
 * - Caso contrário, aponta para ~/.gitcompany/main.db (modo npx/global).
 * Retorna a URL efetiva.
 */
export function ensureDatabaseUrl(): string {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0) {
    return process.env.DATABASE_URL;
  }
  // SQLite exige o prefixo file: e caminho absoluto para funcionar em qualquer cwd.
  const url = `file:${homeDbPath()}`;
  process.env.DATABASE_URL = url;
  return url;
}

// ─────────────────────────────────────────────
// Resolução do entrypoint do scheduler (clone vs pacote npm)
// ─────────────────────────────────────────────

/** Uma raiz válida contém tanto o entrypoint do scheduler quanto a pasta lib/. */
function isValidRoot(dir: string): boolean {
  const hasScheduler =
    fs.existsSync(path.join(dir, "scheduler", "index.ts")) ||
    fs.existsSync(path.join(dir, "scheduler", "index.js"));
  const hasLib = fs.existsSync(path.join(dir, "lib"));
  return hasScheduler && hasLib;
}

/**
 * Raiz do projeto/pacote — a pasta que contém o código-fonte (scheduler/ + lib/).
 *
 * ATENÇÃO: quando o servidor roda a partir do bundle standalone do Next, o
 * process.cwd() (ou dirs próximos) contém um package.json E um scheduler/ (a
 * entry é rastreada como dependência), mas NÃO contém lib/. Por isso exigimos
 * a presença de lib/ junto do scheduler/ para considerar uma raiz válida, e
 * subimos a árvore a partir do cwd para achar a raiz real do pacote.
 */
export function projectRoot(): string {
  const cwd = process.cwd();

  // 1) Sobe a partir do cwd procurando uma raiz válida (scheduler/ + lib/).
  let dir = cwd;
  for (let i = 0; i < 8; i++) {
    if (isValidRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 2) Fallback: diretório do módulo (em CJS/tsx, <root>/lib/runtime-paths).
  try {
    const fromModule = path.resolve(__dirname, "..");
    if (isValidRoot(fromModule)) return fromModule;
  } catch {
    /* __dirname ausente (ESM) */
  }

  // 3) Último recurso: cwd (comportamento antigo).
  return cwd;
}

/**
 * Retorna o comando e args para iniciar o scheduler, funcionando nos dois modos:
 *   - Clone/dev:   node --import tsx <root>/scheduler/index.ts
 *   - Pacote (npm): node <root>/scheduler/index.js  (transpilado, sem tsx)
 * A escolha é por existência do arquivo .js empacotado.
 */
export function schedulerCommand(extraArgs: string[]): { cmd: string; args: string[] } {
  const root = projectRoot();
  const jsEntry = path.join(root, "scheduler", "index.js");
  const tsEntry = path.join(root, "scheduler", "index.ts");

  if (fs.existsSync(jsEntry)) {
    return { cmd: process.execPath, args: [jsEntry, ...extraArgs] };
  }
  // modo clone/dev: executa o .ts via loader tsx
  return { cmd: process.execPath, args: ["--import", "tsx", tsEntry, ...extraArgs] };
}

