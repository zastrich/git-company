// lib/scheduler/scheduler-service.ts
// Single Responsibility: Manage the scheduling loop for all agents of a company.
// Respects isPaused, tickIntervalSeconds (min 300s), and handles graceful shutdown.

import { prisma } from "../db/client";
import { executeAgentTick } from "./agent-runner";
import { createAuditLog } from "../db/audit";

const MIN_TICK_INTERVAL_SECONDS = 300; // 5 minutes minimum

export interface SchedulerOptions {
  companySlug: string;
  agentId?: string;   // Se fornecido, roda apenas esse agente
  runOnce?: boolean;  // Se true, executa uma vez e sai
}

export class SchedulerService {
  private timers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private isShuttingDown = false;
  private companyId = "";

  async start(options: SchedulerOptions): Promise<void> {
    const company = await prisma.company.findUnique({
      where: { slug: options.companySlug },
    });

    if (!company) {
      throw new Error(`Tenant "${options.companySlug}" não encontrado.`);
    }

    this.companyId = company.id;

    // Registrar processo
    await prisma.schedulerProcess.upsert({
      where: { id: `${company.id}-scheduler` },
      update: { status: "RUNNING", startedAt: new Date(), stoppedAt: null, pid: process.pid },
      create: {
        id: `${company.id}-scheduler`,
        companyId: company.id,
        pid: process.pid,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    console.log(`[Scheduler] Started for "${company.name}" (PID: ${process.pid})`);

    // Buscar agentes configurados no banco
    const where: any = { companyId: company.id };
    if (options.agentId) {
      where.agentId = options.agentId;
    }

    const agents = await prisma.agentConfig.findMany({
      where,
      include: { provider: true },
    });

    if (agents.length === 0) {
      console.warn("[Scheduler] Nenhum agente configurado no banco.");
      if (options.runOnce) return;
    }

    // Run once mode
    if (options.runOnce) {
      for (const agent of agents) {
        if (agent.isPaused) {
          console.log(`[Scheduler] Agent "${agent.agentId}" está PAUSADO — ignorado.`);
          continue;
        }
        await this.runAgent(agent, company.id, company.githubToken, company.githubOwner, company.repoName);
      }
      await this.stop();
      return;
    }

    // Continuous mode — um timer por agente
    for (const agent of agents) {
      if (agent.isPaused) {
        console.log(`[Scheduler] Agent "${agent.agentId}" está PAUSADO — ignorado.`);
        continue;
      }

      const intervalSeconds = Math.max(agent.tickIntervalSeconds, MIN_TICK_INTERVAL_SECONDS);
      const intervalMs = intervalSeconds * 1000;

      console.log(`[Scheduler] Agent "${agent.agentId}" agendado a cada ${intervalSeconds}s`);

      // Executar imediatamente
      this.runAgent(agent, company.id, company.githubToken, company.githubOwner, company.repoName).catch(console.error);

      // Agendar
      const timer = setInterval(async () => {
        if (this.isShuttingDown) return;

        // Recarregar config do agente (pode ter sido pausado ou ter mudado intervalo)
        const freshAgent = await prisma.agentConfig.findUnique({
          where: { id: agent.id },
          include: { provider: true },
        });

        if (!freshAgent || freshAgent.isPaused) {
          console.log(`[Scheduler] Agent "${agent.agentId}" pausado ou removido.`);
          return;
        }

        await this.runAgent(freshAgent, company.id, company.githubToken, company.githubOwner, company.repoName);
      }, intervalMs);

      this.timers.set(agent.agentId, timer);
    }

    // Graceful shutdown handlers
    process.on("SIGINT", () => this.stop());
    process.on("SIGTERM", () => this.stop());

    console.log("[Scheduler] Running. Press Ctrl+C to stop.");
  }

  private async runAgent(
    agent: any,
    companyId: string,
    token: string,
    owner: string,
    repo: string
  ): Promise<void> {
    try {
      console.log(`[Scheduler] Tick: "${agent.agentId}" @ ${new Date().toISOString()}`);
      const result = await executeAgentTick(agent, companyId, token, owner, repo);
      console.log(
        `[Scheduler] "${agent.agentId}": ${result.processed} processed, ${result.blocked} blocked, ${result.errors} errors`
      );
    } catch (error: any) {
      console.error(`[Scheduler] Error in agent "${agent.agentId}":`, error.message);
      await createAuditLog({
        companyId,
        agentId: agent.agentId,
        agentName: agent.role,
        action: "SCHEDULER_ERROR",
        details: { error: error.message },
      });
    }
  }

  async stop(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    console.log("\n[Scheduler] Shutting down...");

    // Clear all timers
    for (const [agentId, timer] of this.timers) {
      clearInterval(timer);
      console.log(`[Scheduler] Timer cleared for "${agentId}"`);
    }
    this.timers.clear();

    // Update status in DB
    if (this.companyId) {
      await prisma.schedulerProcess.updateMany({
        where: { companyId: this.companyId, status: "RUNNING" },
        data: { status: "STOPPED", stoppedAt: new Date(), pid: null },
      });
    }

    await prisma.$disconnect();
  }
}
