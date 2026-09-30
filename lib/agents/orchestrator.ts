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
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });

  const tasks: QueuedTask[] = await getAvailableTasksForAgent(
    agentDef,
    token,
    owner,
    repo
  );

  // Carrega as regras de todas as etapas (workflow.json) uma vez por ciclo.
  let stageRules: any[] = [];
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path: "workflow.json" });
    if (!Array.isArray(data) && (data as any).type === "file") {
      const wf = JSON.parse(Buffer.from((data as any).content, "base64").toString("utf-8"));
      stageRules = wf.stages ?? [];
    }
  } catch { /* sem workflow.json — segue sem regras */ }

  const STAGE_PREFIX = "stage::";
  const currentStageOf = (labels: string[]) => {
    const l = labels.find((x) => x.startsWith(STAGE_PREFIX));
    return l ? l.slice(STAGE_PREFIX.length) : undefined;
  };

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

      const result = await runAgent(agentDef, {
        issueContext: task.issue,
        stageRules,
        currentStage: currentStageOf(task.issue.labels),
      });

      // Postar resposta como comentário na Issue do GitHub
      await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: task.issue.number,
        body: `> 🤖 **${agentDef.role}** (GitCompany-AI)\n\n${result.response}`,
      });

      // Issue Lifecycle: detectar conclusão e auto-close
      const completionPatterns = ["[TAREFA_CONCLUÍDA]", "[TAREFA_CONCLUIDA]", "[TASK_COMPLETED]"];
      const isCompleted = completionPatterns.some((p) => result.response.includes(p));

      if (isCompleted) {
        // Auto-close via GraphQL updateIssue (REST issues.update está deprecated).
        try {
          const { graphql } = await import("@octokit/graphql");
          const gql = graphql.defaults({ headers: { authorization: `token ${token}` } });
          const q: any = await gql(
            `query($owner:String!,$repo:String!,$n:Int!){ repository(owner:$owner,name:$repo){ issue(number:$n){ id } } }`,
            { owner, repo, n: task.issue.number }
          );
          await gql(
            `mutation($id:ID!){ updateIssue(input:{id:$id,state:CLOSED}){ issue { id } } }`,
            { id: q.repository.issue.id }
          );
        } catch {
          // fallback REST (ainda funcional até 2028)
          await octokit.rest.issues.update({ owner, repo, issue_number: task.issue.number, state: "closed", state_reason: "completed" });
        }
        console.log(
          `[Orchestrator] Issue #${task.issue.number} fechada automaticamente (tarefa concluída).`
        );
      }

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
