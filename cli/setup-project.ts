#!/usr/bin/env node
// cli/setup-project.ts
// Sets up the GitHub Project V2 with workflow columns from business.json.
// Usage: npx tsx cli/setup-project.ts --company=<slug>

import { prisma } from "../lib/db/client";
import { setupProjectWorkflow } from "../lib/github/project-workflow";
import { buildLocalBusinessJson } from "../lib/sync/org-sync";
import { BaaCDiffEngine } from "../lib/baac/diff";

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

  if (!companySlug) {
    console.error("Uso: npx tsx cli/setup-project.ts --company=<slug>");
    process.exit(1);
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    console.error(`Empresa "${companySlug}" não encontrada.`);
    process.exit(1);
  }

  console.log(`🚀 Configurando infraestrutura para "${company.name}"...\n`);

  // Build business config from local DB
  const config = await buildLocalBusinessJson(company.id);

  // 1. Setup Project Workflow (creates project + columns)
  console.log("📋 Configurando GitHub Project V2...");
  const projectResult = await setupProjectWorkflow(company.id, config.infrastructure.project);
  if (projectResult) {
    console.log(`   Project URL: ${projectResult.projectUrl}`);
    console.log(`   Status Field: ${projectResult.statusFieldId}`);
    console.log(`   Columns: ${projectResult.columnOptions.map((c) => c.name).join(", ")}`);
  }

  // 2. Sync labels and milestones
  console.log("\n🏷️  Sincronizando labels e milestones...");
  const diffEngine = new BaaCDiffEngine(company.githubToken, company.githubOwner, company.repoName);
  await diffEngine.syncInfrastructure(config, company.id, company.projectId);

  // 3. Add existing open issues to the project
  if (projectResult) {
    console.log("\n📌 Adicionando issues existentes ao projeto...");
    const { Octokit } = await import("@octokit/rest");
    const octokit = new Octokit({ auth: company.githubToken });
    const { graphql } = await import("@octokit/graphql");
    const gql = graphql.defaults({ headers: { authorization: `token ${company.githubToken}` } });

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner: company.githubOwner,
      repo: company.repoName,
      state: "all",
      per_page: 100,
    });

    for (const issue of issues) {
      if (issue.pull_request) continue; // skip PRs

      // Get issue node ID
      try {
        const issueData: any = await gql(`
          query($owner: String!, $repo: String!, $number: Int!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $number) { id }
            }
          }
        `, { owner: company.githubOwner, repo: company.repoName, number: issue.number });

        const issueNodeId = issueData.repository.issue.id;

        // Add to project
        const addResult: any = await gql(`
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
              item { id }
            }
          }
        `, { projectId: projectResult.projectId, contentId: issueNodeId });

        const itemId = addResult.addProjectV2ItemById.item.id;

        // Set status based on issue state
        const statusName = issue.state === "closed"
          ? (config.infrastructure.issueLifecycle?.completionColumn ?? "Done")
          : (config.infrastructure.issueLifecycle?.defaultColumn ?? "Backlog");

        // Find status field and option
        const statusField = projectResult.columnOptions.length > 0
          ? projectResult.statusFieldId
          : null;
        const option = projectResult.columnOptions.find((o) => o.name === statusName);

        if (statusField && option) {
          await gql(`
            mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
              updateProjectV2ItemFieldValue(input: {
                projectId: $projectId
                itemId: $itemId
                fieldId: $fieldId
                value: { singleSelectOptionId: $optionId }
              }) { projectV2Item { id } }
            }
          `, {
            projectId: projectResult.projectId,
            itemId,
            fieldId: statusField,
            optionId: option.id,
          });
        }

        const stateIcon = issue.state === "closed" ? "✓" : "○";
        console.log(`   ${stateIcon} Issue #${issue.number}: ${issue.title} → ${statusName}`);
      } catch (err: any) {
        console.warn(`   ⚠️ Issue #${issue.number}: ${err.message}`);
      }
    }
  }

  console.log("\n✅ Infraestrutura configurada com sucesso!");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
