#!/usr/bin/env node
// bin/bootstrap.js
//
// Prepara o banco SQLite de forma AUTÔNOMA, sem depender do CLI do Prisma nem
// do tsx. Usa o @prisma/client que vem embutido no bundle standalone do Next
// (que já inclui o engine nativo), aplicando o schema (prisma/init.sql) de forma
// idempotente e populando os providers padrão.
//
// Uso: node bin/bootstrap.js <databaseUrl>
//   databaseUrl ex.: file:/Users/x/.gitcompany/main.db  (opcional; usa env se ausente)

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// Resolve o @prisma/client: prioriza o que está no bundle standalone (com engine).
function loadPrisma() {
  const candidates = [
    path.join(ROOT, ".next", "standalone", "node_modules", "@prisma", "client"),
    path.join(ROOT, "node_modules", "@prisma", "client"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(c);
    }
  }
  // fallback: resolução normal
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@prisma/client");
}

const DEFAULT_PROVIDERS = [
  { name: "OpenAI (ChatGPT)", slug: "openai", type: "openai", baseUrl: null, isLocal: false },
  { name: "Anthropic (Claude)", slug: "anthropic", type: "anthropic", baseUrl: null, isLocal: false },
  { name: "Google (Gemini)", slug: "gemini", type: "gemini", baseUrl: null, isLocal: false },
  { name: "AWS Bedrock", slug: "bedrock", type: "bedrock", baseUrl: null, isLocal: false },
  { name: "Moonshot (Kimi K3)", slug: "moonshot", type: "moonshot", baseUrl: "https://api.moonshot.cn/v1", isLocal: false },
  { name: "Ollama (Local)", slug: "ollama", type: "ollama", baseUrl: "http://localhost:11434", isLocal: true },
  { name: "Groq", slug: "groq", type: "groq", baseUrl: null, isLocal: false },
];

async function main() {
  const urlArg = process.argv[2];
  if (urlArg) process.env.DATABASE_URL = urlArg;
  if (!process.env.DATABASE_URL) {
    console.error("[bootstrap] DATABASE_URL não definido.");
    process.exit(1);
  }

  const { PrismaClient } = loadPrisma();
  const prisma = new PrismaClient();

  try {
    // 1. Aplicar o schema (idempotente: CREATE TABLE IF NOT EXISTS via split)
    const sqlPath = path.join(ROOT, "prisma", "init.sql");
    if (fs.existsSync(sqlPath)) {
      const raw = fs.readFileSync(sqlPath, "utf8");
      // Remove linhas de comentário e separa por ';'
      const cleaned = raw
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
      const statements = cleaned
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        try {
          await prisma.$executeRawUnsafe(stmt);
        } catch (e) {
          // ignora "already exists" — idempotência
          if (!/already exists/i.test(String(e && e.message))) {
            console.warn("[bootstrap] aviso ao aplicar schema:", String(e && e.message).slice(0, 120));
          }
        }
      }
    }

    // 2. Seed dos providers padrão (idempotente por slug)
    for (const p of DEFAULT_PROVIDERS) {
      await prisma.aIProvider.upsert({
        where: { slug: p.slug },
        update: { name: p.name, type: p.type, baseUrl: p.baseUrl, isLocal: p.isLocal },
        create: p,
      });
    }

    console.log("[bootstrap] banco pronto em " + process.env.DATABASE_URL);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("[bootstrap] erro:", e && e.message ? e.message : e);
  process.exit(1);
});
