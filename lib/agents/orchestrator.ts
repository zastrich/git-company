// lib/agents/orchestrator.ts
import { BusinessConfig, AgentDefinition, IssueContext } from "../baac/types";
import { runAgent } from "./factory";
import { getAvailableTasksForAgent, QueuedTask } from "./task-queue";
import { prisma } from "../db/client";

export interface OrchestratorRunResult {
  agentId: string;
  processed: number;
  blocked: number;
  errors: number;
}

/**
 * Resolve qual agente é responsável por uma Issue específica
 * baseado nas labels da issue vs labels dos agentes no business.json.
 */
export function resolveAgentForIssue(
  issue: IssueContext,
  agents: AgentDefinition[]
): AgentDefinition | null {
  const issueLabelSet = new Set(issue.labels.map((l) => l.toLowerCase()));

  for (const agent of agents) {
    const hasMatchingLabel = agent.labels.some((label) =>
      issueLabelSet.has(label.toLowerCase())
    );
    if (hasMatchingLabel) return agent;
  }

  return null;
}

/**
 * Executa o ciclo de trabalho de um agente específico:
 * 1. Busca Issues com suas labels
 * 2. Filtra bloqueadas por dependências
 * 3. Executa as desbloqueadas e posta comentários no GitHub
 * 4. Registra no AuditLog
 */
export async function runAgentCycle(
  agentDef: AgentDefinition,
  config: BusinessConfig,
  companyId: string,
  token: string,
  owner: string,
  repo: string
): Promise<OrchestratorRunResult> {
  const { Octokit } = await import("octokit");
  const octokit = new (Octokit as any)({ auth: token });

  const tasks: QueuedTask[] = await getAvailableTasksForAgent(
    agentDef,
    token,
    owner,
    repo
  );

  let processed = 0;
  let blocked = 0;
  let errors = 0;

  for (const task of tasks) {
    if (task.isBlocked) {
      blocked++;
      console.log(
        `[Orchestrator] Issue #${task.issue.number} BLOQUEADA por: #${task.pendingBlockers.join(", #")}`
      );

      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_BLOCKED",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            issueTitle: task.issue.title,
            pendingBlockers: task.pendingBlockers,
          }),
        },
      });
      continue;
    }

    try {
      console.log(
        `[Orchestrator] Agent "${agentDef.agentId}" processando Issue #${task.issue.number}: ${task.issue.title}`
      );

      const result = await runAgent(agentDef, { issueContext: task.issue });

      // Postar resposta como comentário na Issue do GitHub
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: task.issue.number,
        body: `> 🤖 **${agentDef.role}** (GitCompany-AI)\n\n${result.response}`,
      });

      processed++;

      // Registrar no AuditLog
      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_PROCESSED",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            issueTitle: task.issue.title,
            provider: agentDef.llm.provider,
            model: agentDef.llm.model,
            responseLength: result.response.length,
          }),
        },
      });
    } catch (error: any) {
      errors++;
      console.error(
        `[Orchestrator] Erro ao processar Issue #${task.issue.number}:`,
        error.message
      );

      await prisma.auditLog.create({
        data: {
          companyId,
          agentId: agentDef.agentId,
          agentName: agentDef.role,
          action: "TASK_ERROR",
          details: JSON.stringify({
            issueNumber: task.issue.number,
            error: error.message,
          }),
        },
      });
    }
  }

  return { agentId: agentDef.agentId, processed, blocked, errors };
}
