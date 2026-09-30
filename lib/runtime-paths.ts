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

/** Raiz do projeto/pacote (a pasta que contém package.json). */
export function projectRoot(): string {
  // Em clone/dev, process.cwd() é a raiz. Em pacote instalado, este módulo
  // vive em <pkg>/lib/runtime-paths(.ts|.js); subimos um nível.
  // Preferimos process.cwd() quando existir um package.json ali (clone/dev),
  // senão caímos para o diretório do módulo.
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, "package.json"))) return cwd;
  // __dirname existe em CJS; em ESM o bundler do Next injeta. Fallback seguro:
  try {
    return path.resolve(__dirname, "..");
  } catch {
    return cwd;
  }
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
