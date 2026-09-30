#!/usr/bin/env node
// bin/prepack-clean.js
//
// Roda após `next build` (via prepack), antes de empacotar para o npm.
// Remove artefatos que NÃO devem ir no pacote publicado — em especial o .env
// que o build do Next copia para dentro de .next/standalone.

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

const targets = [
  ".next/standalone/.env",
  ".next/standalone/.env.local",
  ".next/standalone/.env.production",
  ".next/standalone/main.db",
];

for (const rel of targets) {
  const p = path.join(ROOT, rel);
  try {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      console.log("[prepack-clean] removido: " + rel);
    }
  } catch (e) {
    console.warn("[prepack-clean] não foi possível remover " + rel + ": " + e.message);
  }
}

// Cria os aliases @prisma/client-<hash> exigidos pelo bundle Turbopack.
try {
  ensurePrismaAlias(path.join(ROOT, ".next", "standalone"));
} catch (e) {
  console.warn("[prepack-clean] alias prisma: " + e.message);
}

console.log("[prepack-clean] ok");

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirSync(s, d);
    else fs.copyFileSync(s, d);
  }
}

function ensurePrismaAlias(saRoot) {
  const serverDir = path.join(saRoot, ".next", "server");
  const nmPrisma = path.join(saRoot, "node_modules", "@prisma");
  const realClient = path.join(nmPrisma, "client");
  if (!fs.existsSync(serverDir) || !fs.existsSync(realClient)) return;
  const hashes = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) {
        const re = /@prisma\/client-([0-9a-f]+)/g;
        const txt = fs.readFileSync(p, "utf8");
        let m;
        while ((m = re.exec(txt))) hashes.add(m[1]);
      }
    }
  };
  walk(serverDir);
  for (const h of hashes) {
    const aliasDir = path.join(nmPrisma, "client-" + h);
    if (!fs.existsSync(aliasDir)) {
      copyDirSync(realClient, aliasDir);
      console.log("[prepack-clean] alias prisma criado: @prisma/client-" + h);
    }
  }
}
