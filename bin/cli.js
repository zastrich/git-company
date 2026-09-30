#!/usr/bin/env node
// bin/cli.js
//
// Ponto de entrada do pacote npm (npx gitcompany-ai <comando>).
// Funciona tanto instalado globalmente (npx) quanto dentro do repo clonado.
//
// Comandos:
//   deploy        prepara o banco, sobe o servidor e abre o navegador
//   start         sobe o servidor (sem abrir navegador)
//   doctor        diagnóstico rápido (banco + versão)
//   db:reset      recria o banco local no diretório do usuário
//   <cli-cmd> ... repassa para a CLI administrativa (tenant:*, company:*, agent:*, etc.)

"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");
const { spawnSync, spawn } = require("child_process");

// ─────────────────────────────────────────────
// Paths e ambiente
// ─────────────────────────────────────────────

const PKG_ROOT = path.resolve(__dirname, "..");

function dataDir() {
  const dir = path.join(os.homedir(), ".gitcompany");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isClone() {
  // Em clone/dev existe scheduler/index.ts (código-fonte) e um .env local.
  return fs.existsSync(path.join(PKG_ROOT, "scheduler", "index.ts"));
}

/**
 * Garante DATABASE_URL. No pacote (npx) aponta para ~/.gitcompany/main.db.
 * No clone/dev respeita o .env (DATABASE_URL=file:./main.db).
 */
function ensureDbEnv() {
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.trim()) return process.env.DATABASE_URL;
  if (isClone()) {
    // clone sem env definida — usa o banco local do repo
    process.env.DATABASE_URL = "file:./main.db";
    return process.env.DATABASE_URL;
  }
  const url = "file:" + path.join(dataDir(), "main.db");
  process.env.DATABASE_URL = url;
  return url;
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: PKG_ROOT, env: process.env, ...opts });
  return res.status ?? 1;
}

// tsx (clone) vs node puro (pacote transpilado)
function tsxRunner(entryTs, entryJs, args) {
  const js = path.join(PKG_ROOT, entryJs);
  if (fs.existsSync(js)) return run(process.execPath, [js, ...args]);
  return run(process.execPath, ["--import", "tsx", path.join(PKG_ROOT, entryTs), ...args]);
}

// ─────────────────────────────────────────────
// Bootstrap do banco (idempotente)
// ─────────────────────────────────────────────

function dbFilePath() {
  const url = process.env.DATABASE_URL || "";
  const m = url.replace(/^file:/, "");
  return path.isAbsolute(m) ? m : path.join(PKG_ROOT, m);
}

function bootstrapDb({ force = false } = {}) {
  ensureDbEnv();
  const exists = fs.existsSync(dbFilePath());
  const prismaBin = path.join(PKG_ROOT, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
  const prisma = fs.existsSync(prismaBin) ? prismaBin : "npx";
  const prismaArgs = fs.existsSync(prismaBin) ? [] : ["prisma"];

  if (force || !exists) {
    console.log("• Preparando banco de dados local em " + dbFilePath());
    const pushArgs = [...prismaArgs, "db", "push", "--skip-generate", "--accept-data-loss"];
    run(prisma, pushArgs);
    // seed dos providers padrão
    tsxRunner("prisma/seed.ts", "prisma/seed.js", []);
  }
}

// ─────────────────────────────────────────────
// Abrir o navegador (cross-platform)
// ─────────────────────────────────────────────

function openBrowser(url) {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try { spawn(cmd, args, { stdio: "ignore", detached: true }).unref(); } catch { /* ignore */ }
}

// ─────────────────────────────────────────────
// Servidor Next (standalone no pacote, next start no clone)
// ─────────────────────────────────────────────

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * O build standalone do Next NÃO copia .next/static nem public.
 * Garante que ambos estejam dentro de .next/standalone para o server.js servir.
 */
function ensureStandaloneAssets() {
  const saRoot = path.join(PKG_ROOT, ".next", "standalone");
  if (!fs.existsSync(saRoot)) return;
  const staticSrc = path.join(PKG_ROOT, ".next", "static");
  const staticDest = path.join(saRoot, ".next", "static");
  if (fs.existsSync(staticSrc) && !fs.existsSync(staticDest)) copyDirSync(staticSrc, staticDest);
  const publicSrc = path.join(PKG_ROOT, "public");
  const publicDest = path.join(saRoot, "public");
  if (fs.existsSync(publicSrc) && !fs.existsSync(publicDest)) copyDirSync(publicSrc, publicDest);
}

function startServer({ open = false } = {}) {
  ensureDbEnv();
  const port = process.env.PORT || "3000";
  const url = `http://localhost:${port}`;
  const standalone = path.join(PKG_ROOT, ".next", "standalone", "server.js");
  ensureStandaloneAssets();

  let child;
  if (fs.existsSync(standalone)) {
    console.log("• Iniciando servidor (standalone) em " + url);
    child = spawn(process.execPath, [standalone], {
      stdio: "inherit",
      cwd: PKG_ROOT,
      env: { ...process.env, PORT: port, HOSTNAME: "127.0.0.1" },
    });
  } else {
    // clone/dev sem build standalone: usa next start (requer build prévio) ou dev
    console.log("• Iniciando servidor (next) em " + url);
    const nextBin = path.join(PKG_ROOT, "node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");
    const hasBuild = fs.existsSync(path.join(PKG_ROOT, ".next", "BUILD_ID"));
    const mode = hasBuild ? "start" : "dev";
    child = spawn(nextBin, [mode, "-p", port], { stdio: "inherit", cwd: PKG_ROOT, env: process.env });
  }

  if (open) setTimeout(() => openBrowser(url), 2500);

  child.on("exit", (code) => process.exit(code ?? 0));
  // encaminha sinais para encerrar limpo
  ["SIGINT", "SIGTERM"].forEach((sig) => process.on(sig, () => { try { child.kill(sig); } catch {} }));
}

// ─────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────

const [, , command, ...rest] = process.argv;

(function main() {
  ensureDbEnv();

  switch (command) {
    case "deploy":
      bootstrapDb();
      startServer({ open: true });
      break;

    case "start":
      bootstrapDb();
      startServer({ open: false });
      break;

    case "db:reset":
      bootstrapDb({ force: true });
      console.log("✅ Banco recriado em " + dbFilePath());
      break;

    case "doctor": {
      console.log("GitCompany doctor");
      console.log("  Pacote:      " + PKG_ROOT);
      console.log("  Modo:        " + (isClone() ? "clone/dev" : "pacote (npx)"));
      console.log("  DATABASE_URL:" + process.env.DATABASE_URL);
      console.log("  Banco existe:" + fs.existsSync(dbFilePath()));
      console.log("  Standalone:  " + fs.existsSync(path.join(PKG_ROOT, ".next", "standalone", "server.js")));
      break;
    }

    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(`GitCompany AI\n\nUso: npx gitcompany-ai <comando>\n\n  deploy        prepara o banco, sobe o servidor e abre o navegador\n  start         sobe o servidor (sem abrir navegador)\n  db:reset      recria o banco local\n  doctor        diagnóstico\n\nComandos administrativos (repassados à CLI):\n  tenant:create tenant:list company:create company:sync\n  provider:list provider:add repo:register repo:list repo:sync\n  agent:add agent:pause agent:resume agent:list agent:run\n  scheduler:start scheduler:stop scheduler:status secret:set secret:list\n\nEx.: npx gitcompany-ai provider:list`);
      break;

    default: {
      // Repassa qualquer outro comando para a CLI administrativa.
      bootstrapDb();
      const code = tsxRunner("cli/tenant.ts", "cli/tenant.js", [command, ...rest]);
      process.exit(code);
    }
  }
})();
