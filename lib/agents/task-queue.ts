// lib/agents/task-queue.ts
import { Octokit } from "@octokit/rest";
import { AgentDefinition, IssueContext } from "../baac/types";
import { GitHubGraphQLClient } from "../github/graphql";

export interface QueuedTask {
  issue: IssueContext;
  agentDef: AgentDefinition;
  isBlocked: boolean;
  /** Issues que precisam fechar antes desta rodar */
  pendingBlockers: number[];
}

/**
 * Verifica se uma Issue está bloqueada (algum blocker ainda está aberto).
 */
export function isIssueBlocked(issue: IssueContext): boolean {
  return issue.blockedBy.some((dep) => dep.state === "open");
}

/**
 * Retorna os números das issues bloqueadoras que ainda estão abertas.
 */
export function getPendingBlockers(issue: IssueContext): number[] {
  return issue.blockedBy.filter((dep) => dep.state === "open").map((dep) => dep.number);
}

/**
 * Busca todas as Issues abertas de um tenant no GitHub que correspondem
 * às labels de um agente, enriquecendo com relacionamentos.
 */
export async function getAvailableTasksForAgent(
  agentDef: AgentDefinition,
  token: string,
  owner: string,
  repo: string
): Promise<QueuedTask[]> {
  const octokit = new Octokit({ auth: token });
  const graphqlClient = new GitHubGraphQLClient(token);

  if (!agentDef.labels || agentDef.labels.length === 0) {
    return [];
  }

  // Buscar Issues com ANY das labels do agente (uma query por label, depois deduplica)
  const issueMap = new Map<number, any>();
  for (const label of agentDef.labels) {
    const { data: rawIssues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: label,
      per_page: 50,
    });
    for (const issue of rawIssues) {
      if (!issueMap.has(issue.number)) {
        issueMap.set(issue.number, issue);
      }
    }
  }

  const rawIssues = Array.from(issueMap.values());

  const tasks: QueuedTask[] = [];

  for (const rawIssue of rawIssues) {
    // Enriquecer com relacionamentos via GraphQL
    let issueContext: IssueContext;
    try {
      issueContext = await graphqlClient.getIssueWithRelationships(
        owner,
        repo,
        rawIssue.number
      );
    } catch (error) {
      console.warn(
        `[TaskQueue] Falha ao buscar relacionamentos da Issue #${rawIssue.number}:`,
        error
      );
      // Fallback sem relacionamentos
      issueContext = {
        number: rawIssue.number,
        title: rawIssue.title,
        body: rawIssue.body ?? "",
        state: "open",
        url: rawIssue.html_url,
        labels: rawIssue.labels.map((l: any) => (typeof l === "string" ? l : l.name ?? "")),
        assignees: rawIssue.assignees?.map((a: any) => a.login) ?? [],
        parent: null,
        blockedBy: [],
        blocking: [],
      };
    }

    const blocked = isIssueBlocked(issueContext);
    const pendingBlockers = getPendingBlockers(issueContext);

    tasks.push({
      issue: issueContext,
      agentDef,
      isBlocked: blocked,
      pendingBlockers,
    });
  }

  // Ordenar: não bloqueadas primeiro
  tasks.sort((a, b) => Number(a.isBlocked) - Number(b.isBlocked));

  return tasks;
}
