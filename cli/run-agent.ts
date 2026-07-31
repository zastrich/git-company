#!/usr/bin/env node
// cli/run-agent.ts
// Executa um ciclo do agente diretamente (sem Bun.spawn).
// Uso: npx tsx cli/run-agent.ts --company=<slug> [--agent=<agentId>]

import { prisma } from "../lib/db/client";
import { executeAgentTick } from "../lib/scheduler/agent-runner";

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
  const targetAgentId = args["agent"] as string | undefined;

  if (!companySlug) {
    console.error("Uso: npx tsx cli/run-agent.ts --company=<slug> [--agent=<agentId>]");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    console.error(`Empresa "${companySlug}" não encontrada.`);
    process.exit(1);
  }

  // Buscar agentes
  const where: any = { companyId: company.id, isPaused: false };
  if (targetAgentId) where.agentId = targetAgentId;

  const agents = await prisma.agentConfig.findMany({
    where,
    include: { provider: true },
  });

  if (agents.length === 0) {
    console.error(`Nenhum agente${targetAgentId ? ` "${targetAgentId}"` : ""} encontrado.`);
    process.exit(1);
  }

  console.log(`🚀 Executando ${agents.length} agente(s) para "${company.name}"...\n`);

  for (const agent of agents) {
    console.log(`⏱  Agent "${agent.agentId}" (${agent.role}) — ${agent.provider.name} / ${agent.model}`);
    console.log(`   Labels: ${agent.labels || "—"}`);

    try {
      const result = await executeAgentTick(
        agent,
        company.id,
        company.githubToken,
        company.githubOwner,
        company.repoName
      );
      console.log(`   ✅ Resultado: ${result.processed} processadas, ${result.blocked} bloqueadas, ${result.errors} erros\n`);
    } catch (err: any) {
      console.error(`   ❌ Erro: ${err.message}\n`);
    }
  }

  await prisma.$disconnect();
  console.log("✅ Ciclo concluído.");
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
