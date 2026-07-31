import { Octokit } from "octokit";
import { Label, Milestone, Workflow } from "../baac/types";

export class GitHubRestClient {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(token: string, owner: string, repo: string) {
    this.octokit = new Octokit({ auth: token });
    this.owner = owner;
    this.repo = repo;
  }

  async syncLabels(expectedLabels: Label[]) {
    const { data: existingLabels } = await this.octokit.rest.issues.listLabelsForRepo({
      owner: this.owner,
      repo: this.repo,
    });

    const existingNames = new Set(existingLabels.map((l) => l.name));

    for (const label of expectedLabels) {
      if (!existingNames.has(label.name)) {
        await this.octokit.rest.issues.createLabel({
          owner: this.owner,
          repo: this.repo,
          name: label.name,
          color: label.color,
          description: label.description,
        });
      } else {
        const existing = existingLabels.find((l) => l.name === label.name);
        if (existing?.color !== label.color || existing?.description !== label.description) {
          await this.octokit.rest.issues.updateLabel({
            owner: this.owner,
            repo: this.repo,
            name: label.name,
            color: label.color,
            description: label.description,
          });
        }
      }
    }
  }

  async syncMilestones(expectedMilestones: Milestone[]) {
    const { data: existingMilestones } = await this.octokit.rest.issues.listMilestones({
      owner: this.owner,
      repo: this.repo,
      state: "all",
    });

    const existingTitles = new Set(existingMilestones.map((m) => m.title));

    for (const ms of expectedMilestones) {
      if (!existingTitles.has(ms.title)) {
        await this.octokit.rest.issues.createMilestone({
          owner: this.owner,
          repo: this.repo,
          title: ms.title,
          description: ms.description,
          due_on: ms.due_on,
        });
      } else {
        const existing = existingMilestones.find((m) => m.title === ms.title);
        // Compare values, update if needed
        if (existing && (existing.description !== ms.description || existing.due_on !== ms.due_on)) {
          await this.octokit.rest.issues.updateMilestone({
            owner: this.owner,
            repo: this.repo,
            milestone_number: existing.number,
            title: ms.title,
            description: ms.description,
            due_on: ms.due_on,
          });
        }
      }
    }
  }

  async syncWorkflows(expectedWorkflows: Workflow[]) {
    for (const wf of expectedWorkflows) {
      const path = `.github/workflows/${wf.file}`;
      let sha: string | undefined;

      try {
        // Try to get the existing file to get its SHA for updating
        const { data } = await this.octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
        });
        
        if (!Array.isArray(data) && data.type === "file") {
          sha = data.sha;
          // Decode content to see if it changed
          const contentStr = Buffer.from(data.content, "base64").toString("utf8");
          if (contentStr === wf.content) {
            continue; // No changes needed
          }
        }
      } catch (error: any) {
        // 404 means the file doesn't exist yet, which is fine
        if (error.status !== 404) {
          throw error;
        }
      }

      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message: `BaaC: Sync workflow ${wf.file}`,
        content: Buffer.from(wf.content).toString("base64"),
        sha,
      });
    }
  }
}
