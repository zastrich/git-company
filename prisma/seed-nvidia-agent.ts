// prisma/seed-nvidia-agent.ts
//
// Cria um agente que usa o provider custom "nvidia" (NVIDIA NIM, OpenAI-compatible).
// Requer que o provider "nvidia" já exista (cadastrado pela UI) e o secret
// PROVIDER_NVIDIA_API_KEY já gravado. NÃO grava token aqui (write-only via app).
//
// Modelo: por padrão usa um modelo NIM que responde nesta conta. O Kimi K3
// (moonshotai/kimi-k3) está no catálogo mas retornou 404 (não provisionado
// para inferência nesta conta), então o default é openai/gpt-oss-20b.
//
// Run: npx tsx prisma/seed-nvidia-agent.ts [modelId]

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MODEL = process.argv[2] ?? "openai/gpt-oss-20b";

async function main() {
  const company = await prisma.company.findUnique({ where: { slug: "meu-organizador" } });
  if (!company) throw new Error('Empresa "meu-organizador" não encontrada.');

  const provider = await prisma.aIProvider.findUnique({ where: { slug: "nvidia" } });
  if (!provider) throw new Error('Provider "nvidia" não encontrado. Cadastre pela UI primeiro.');

  const agent = await prisma.agentConfig.upsert({
    where: { companyId_agentId: { companyId: company.id, agentId: "consultor-nvidia" } },
    update: { role: "Consultor de Produtividade (NVIDIA)", providerId: provider.id, model: MODEL },
    create: {
      companyId: company.id,
      agentId: "consultor-nvidia",
      role: "Consultor de Produtividade (NVIDIA)",
      type: "ai",
      context:
        "Você é um consultor de produtividade pessoal. Responda em português do Brasil, " +
        "de forma objetiva. Ajude a priorizar tarefas, sugerir métodos (GTD, Pomodoro, Eisenhower) " +
        "e organizar a rotina de trabalho.",
      providerId: provider.id,
      model: MODEL,
      temperature: 0.3,
      maxTokens: 512,
      tickIntervalSeconds: 3600,
      labels: "produtividade,consultoria",
      isCeo: false,
    },
  });

  console.log(`✓ Agente "${agent.agentId}" (${agent.role}) → provider "nvidia", model "${MODEL}"`);
  console.log("Chat: http://localhost:3000/dashboard/meu-organizador/chat/consultor-nvidia");
}

main()
  .catch((e) => { console.error(e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
