import { BusinessConfig } from "./types";
import { GitHubRestClient } from "../github/rest";
import { GitHubGraphQLClient } from "../github/graphql";

export class BaaCDiffEngine {
  private restClient: GitHubRestClient;
  private graphqlClient: GitHubGraphQLClient;

  constructor(token: string, owner: string, repo: string) {
    this.restClient = new GitHubRestClient(token, owner, repo);
    this.graphqlClient = new GitHubGraphQLClient(token);
  }

  async syncInfrastructure(config: BusinessConfig, projectId?: string | null) {
    console.log(`Starting BaaC Infrastructure Sync for ${config.companyName}...`);

    try {
      // 1. Sync Labels
      if (config.infrastructure.labels && config.infrastructure.labels.length > 0) {
        console.log("Syncing labels...");
        await this.restClient.syncLabels(config.infrastructure.labels);
      }

      // 2. Sync Milestones
      if (config.infrastructure.milestones && config.infrastructure.milestones.length > 0) {
        console.log("Syncing milestones...");
        await this.restClient.syncMilestones(config.infrastructure.milestones);
      }

      // 3. Sync Workflows
      if (config.infrastructure.workflows && config.infrastructure.workflows.length > 0) {
        console.log("Syncing workflows...");
        await this.restClient.syncWorkflows(config.infrastructure.workflows);
      }

      // 4. Sync Project Views (GraphQL)
      if (config.infrastructure.project && projectId) {
        console.log("Syncing project views...");
        await this.graphqlClient.syncProjectViews(projectId, config.infrastructure.project);
      }

      console.log(`BaaC Infrastructure Sync for ${config.companyName} completed successfully.`);
    } catch (error) {
      console.error(`BaaC Sync Failed for ${config.companyName}:`, error);
      throw error;
    }
  }
}
