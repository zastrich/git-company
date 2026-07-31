// lib/github/graphql.ts
import { graphql } from "@octokit/graphql";
import { Project, IssueContext, IssueRelation } from "../baac/types";

export class GitHubGraphQLClient {
  private graphqlWithAuth: typeof graphql;

  constructor(token: string) {
    this.graphqlWithAuth = graphql.defaults({
      headers: {
        authorization: `token ${token}`,
      },
    });
  }

  // ─────────────────────────────────────────────
  // Issue Relationships
  // ─────────────────────────────────────────────

  /**
   * Busca uma Issue com todos os seus relacionamentos nativos do GitHub:
   * - parent (Add parent)
   * - blockedBy (Mark as blocked by)
   * - blocking (Mark as blocking)
   */
  async getIssueWithRelationships(
    owner: string,
    repo: string,
    issueNumber: number
  ): Promise<IssueContext> {
    // O GitHub expõe relacionamentos de Issues via `timelineItems` para blocked_by/blocking
    // e `parent` via `trackedBy`/`tracksIssues` para hierarquia.
    const query = `
      query GetIssueRelationships($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            number
            title
            body
            state
            url
            labels(first: 20) { nodes { name } }
            assignees(first: 10) { nodes { login } }
            
            # Parent: issues que rastreiam esta issue
            trackedBy: trackedInIssues(first: 5) {
              nodes {
                number
                title
                state
                url
              }
            }
            
            # Issues relacionadas via timelineItems (blocked_by e blocking)
            timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT]) {
              nodes {
                ... on CrossReferencedEvent {
                  source {
                    ... on Issue {
                      number
                      title
                      state
                      url
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;

    let data: any;
    try {
      data = await this.graphqlWithAuth(query, { owner, repo, number: issueNumber });
    } catch (error: any) {
      console.error(`[GraphQL] Falha ao buscar Issue #${issueNumber}:`, error.message);
      throw error;
    }

    const issue = data.repository.issue;

    // Mapear labels e assignees
    const labels: string[] = issue.labels.nodes.map((n: any) => n.name);
    const assignees: string[] = issue.assignees.nodes.map((n: any) => n.login);

    // Parent: pega o primeiro item em trackedBy (se existir)
    const parentNode = issue.trackedBy?.nodes?.[0] ?? null;
    const parent: IssueRelation | null = parentNode
      ? {
          number: parentNode.number,
          title: parentNode.title,
          state: parentNode.state.toLowerCase() as "open" | "closed",
          url: parentNode.url,
        }
      : null;

    // NOTE: A API REST e GraphQL do GitHub não expõem nativamente os relacionamentos
    // "blocked by" / "blocking" como campos diretos — eles são gerenciados pelo
    // GitHub Projects V2. Para acessá-los, precisamos usar a API de issues linked
    // ou a convenção de labels especiais. Como workaround robusto, usamos labels
    // de convenção: "blocked-by:#N" e lemos as cross-references do timeline.
    //
    // Alternativa futura: migrar para Projects V2 GraphQL quando a API estabilizar.
    const blockedBy: IssueRelation[] = [];
    const blocking: IssueRelation[] = [];

    // Parsear labels de convenção: "blocked-by:#42" e "blocking:#45"
    for (const label of labels) {
      const blockedByMatch = label.match(/^blocked-by:#(\d+)$/i);
      if (blockedByMatch) {
        const blockingIssueNumber = parseInt(blockedByMatch[1], 10);
        try {
          const linkedIssue = await this.getIssueSummary(owner, repo, blockingIssueNumber);
          blockedBy.push(linkedIssue);
        } catch {
          blockedBy.push({
            number: blockingIssueNumber,
            title: `Issue #${blockingIssueNumber}`,
            state: "open",
            url: `https://github.com/${owner}/${repo}/issues/${blockingIssueNumber}`,
          });
        }
      }

      const blockingMatch = label.match(/^blocking:#(\d+)$/i);
      if (blockingMatch) {
        const blockedIssueNumber = parseInt(blockingMatch[1], 10);
        try {
          const linkedIssue = await this.getIssueSummary(owner, repo, blockedIssueNumber);
          blocking.push(linkedIssue);
        } catch {
          blocking.push({
            number: blockedIssueNumber,
            title: `Issue #${blockedIssueNumber}`,
            state: "open",
            url: `https://github.com/${owner}/${repo}/issues/${blockedIssueNumber}`,
          });
        }
      }
    }

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      state: issue.state.toLowerCase() as "open" | "closed",
      url: issue.url,
      labels,
      assignees,
      parent,
      blockedBy,
      blocking,
    };
  }

  /**
   * Busca um resumo simples de uma Issue (número, título, estado).
   */
  async getIssueSummary(owner: string, repo: string, number: number): Promise<IssueRelation> {
    const query = `
      query GetIssueSummary($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          issue(number: $number) {
            number
            title
            state
            url
          }
        }
      }
    `;
    const data: any = await this.graphqlWithAuth(query, { owner, repo, number });
    const issue = data.repository.issue;
    return {
      number: issue.number,
      title: issue.title,
      state: issue.state.toLowerCase() as "open" | "closed",
      url: issue.url,
    };
  }

  // ─────────────────────────────────────────────
  // Projects V2 Views
  // ─────────────────────────────────────────────

  async syncProjectViews(projectId: string, expectedProject: Project) {
    const createProjectViewMutation = `
      mutation($projectId: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
        createProjectV2View(input: {projectId: $projectId, name: $name, layout: $layout}) {
          view { id name layout }
        }
      }
    `;

    for (const view of expectedProject.views) {
      try {
        await this.graphqlWithAuth(createProjectViewMutation, {
          projectId,
          name: view.name,
          layout: view.layout,
        });
      } catch {
        // Silently continue — view pode já existir
      }
    }
  }
}
