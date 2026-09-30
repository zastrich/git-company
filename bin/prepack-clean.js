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

console.log("[prepack-clean] ok");
