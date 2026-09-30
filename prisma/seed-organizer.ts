// prisma/seed-organizer.ts
//
// Seed do "Organizador Pessoal" (Personal Operating System).
// Cria, sem necessidade de token GitHub ou API key:
//   1. Um provider de IA "local" (LLM básica determinística).
//   2. Uma empresa/organizador ("meu-organizador").
//   3. Um agente "Organizador Pessoal" usando o provider local.
//
// Run: npx tsx prisma/seed-organizer.ts

import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

const ORGANIZER_CONTEXT = `Você é o Organizador Pessoal do usuário — um assistente de produtividade.
Seu papel é ajudar a organizar tarefas, priorizar demandas (urgente x importante),
sugerir blocos de foco (Pomodoro), e apoiar a gestão do tempo e do bem-estar.
Responda sempre em português do Brasil, de forma objetiva e acolhedora.`;

async function main() {
  console.log("Seeding Personal Organizer (POS)...\n");

  // 1. Provider local (LLM básica, sem rede/API key)
  const provider = await prisma.aIProvider.upsert({
    where: { slug: "local" },
    update: { name: "Organizador Local (Básico)", type: "local", isLocal: true },
    create: {
      name: "Organizador Local (Básico)",
      slug: "local",
      type: "local",
      baseUrl: null,
      isLocal: true,
    },
  });
  console.log(`  ✓ Provider: ${provider.name} [${provider.slug}]`);

  // 2. Empresa / Organizador Pessoal
  const company = await prisma.company.upsert({
    where: { slug: "meu-organizador" },
    update: { name: "Meu Organizador Pessoal", mission: "Organizar meu tempo, tarefas e bem-estar." },
    create: {
      name: "Meu Organizador Pessoal",
      slug: "meu-organizador",
      repoPrefix: "org-",
      githubOwner: "local",
      githubToken: "local-no-token",
      webhookSecret: crypto.randomUUID(),
      repoName: "org-local",
      mission: "Organizar meu tempo, tarefas e bem-estar.",
    },
  });
  console.log(`  ✓ Organizador: ${company.name} [${company.slug}]`);

  // 3. Agente Organizador Pessoal (usa o provider local)
  const agent = await prisma.agentConfig.upsert({
    where: { companyId_agentId: { companyId: company.id, agentId: "organizador" } },
    update: {
      role: "Organizador Pessoal",
      context: ORGANIZER_CONTEXT,
      providerId: provider.id,
      model: "local-organizer-v1",
      isCeo: true,
    },
    create: {
      companyId: company.id,
      agentId: "organizador",
      role: "Organizador Pessoal",
      type: "ai",
      context: ORGANIZER_CONTEXT,
      providerId: provider.id,
      model: "local-organizer-v1",
      temperature: 0.2,
      maxTokens: 2048,
      tickIntervalSeconds: 3600,
      labels: "tarefas,foco,rotina",
      isCeo: true,
    },
  });
  console.log(`  ✓ Agente: ${agent.role} [${agent.agentId}] → provider "local"`);

  console.log("\nPronto! Acesse http://localhost:3000 e abra 'Meu Organizador Pessoal'.");
  console.log("Chat direto: http://localhost:3000/dashboard/meu-organizador/chat/organizador");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
