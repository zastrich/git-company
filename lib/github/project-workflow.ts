// lib/github/project-workflow.ts
// Single Responsibility: Manage GitHub Project V2 workflow (columns, status, issue lifecycle).
// Creates projects with custom Single Select "Status" field and configures the workflow columns.

import { prisma } from "../db/client";
import { graphql } from "@octokit/graphql";
import { ProjectWorkflow, IssueLifecycle } from "../baac/types";
import { createAuditLog } from "../db/audit";

export interface ProjectSetupResult {
  projectId: string;
  projectUrl: string;
  statusFieldId: string;
  columnOptions: { id: string; name: string }[];
}

/**
 * Creates or retrieves a GitHub Project V2 with custom workflow columns.
 * The columns are implemented as a Single Select field called "Status".
 */
export async function setupProjectWorkflow(
  companyId: string,
  config: ProjectWorkflow
): Promise<ProjectSetupResult | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa não encontrada.");

  const gql = graphql.defaults({
    headers: { authorization: `token ${company.githubToken}` },
  });

  try {
    // 1. Get user/org node ID
    const userData: any = await gql(`query { viewer { id login } }`);
    const ownerId = userData.viewer.id;

    let projectId = company.projectId;
    let projectUrl = "";

    // 2. Create project if not exists
    if (!projectId) {
      const createResult: any = await gql(`
        mutation($ownerId: ID!, $title: String!) {
          createProjectV2(input: { ownerId: $ownerId, title: $title }) {
            projectV2 { id number url }
          }
        }
      `, { ownerId, title: config.title });

      projectId = createResult.createProjectV2.projectV2.id;
      projectUrl = createResult.createProjectV2.projectV2.url;

      await prisma.company.update({
        where: { id: companyId },
        data: { projectId },
      });

      console.log(`   ✅ Project V2 criado: ${projectUrl}`);
    } else {
      // Get existing project URL
      try {
        const projectData: any = await gql(`
          query($id: ID!) { node(id: $id) { ... on ProjectV2 { url } } }
        `, { id: projectId });
        projectUrl = projectData.node.url;
      } catch { /* ignore */ }
    }

    // 3. Create views
    for (const view of config.views) {
      try {
        await gql(`
          mutation($projectId: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
            createProjectV2View(input: { projectId: $projectId, name: $name, layout: $layout }) {
              projectV2View { id }
            }
          }
        `, { projectId, name: view.name, layout: view.layout });
      } catch { /* view may already exist */ }
    }

    // 4. Find or create the "Status" single-select field
    const fieldsData: any = await gql(`
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id
                  name
                  options { id name }
                }
              }
            }
          }
        }
      }
    `, { projectId });

    const statusField = fieldsData.node.fields.nodes.find(
      (f: any) => f.name === "Status" && f.options
    );

    // 5. Map our custom columns to existing GitHub status options
    // GitHub Projects V2 doesn't expose a mutation to add options to single-select fields.
    // We map our workflow columns to the available status options.
    const columnMapping: Record<string, string> = {};
    if (statusField) {
      const existingOptions = statusField.options.map((o: any) => o.name);
      for (const col of config.columns) {
        // Try exact match first
        const exactMatch = existingOptions.find((o: string) => o === col.name);
        if (exactMatch) {
          columnMapping[col.name] = exactMatch;
          continue;
        }
        // Fuzzy mapping for common columns
        if (col.isDone && existingOptions.includes("Done")) {
          columnMapping[col.name] = "Done";
        } else if (col.name.toLowerCase().includes("progress") && existingOptions.includes("In Progress")) {
          columnMapping[col.name] = "In Progress";
        } else if (col.name.toLowerCase().includes("backlog") && existingOptions.includes("Todo")) {
          columnMapping[col.name] = "Todo";
        } else {
          // Default: map to Todo for unmatched columns
          columnMapping[col.name] = existingOptions[0] ?? "Todo";
        }
      }
      console.log(`   ℹ️  Column mapping: ${JSON.stringify(columnMapping)}`);
    }

    await createAuditLog({
      companyId,
      agentName: "System",
      action: "PROJECT_WORKFLOW_SETUP",
      details: { projectId, columns: config.columns.map((c) => c.name) },
    });

    return {
      projectId: projectId!,
      projectUrl,
      statusFieldId: statusField?.id ?? "",
      columnOptions: statusField?.options ?? [],
    };
  } catch (err: any) {
    console.error(`   ❌ Project workflow setup failed: ${err.message}`);
    return null;
  }
}

/**
 * Adds an issue to the project and sets its initial status column.
 */
export async function addIssueToProject(
  companyId: string,
  issueNodeId: string,
  statusColumn?: string
): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.projectId) return;

  const gql = graphql.defaults({
    headers: { authorization: `token ${company.githubToken}` },
  });

  try {
    // Add item to project
    const addResult: any = await gql(`
      mutation($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
          item { id }
        }
      }
    `, { projectId: company.projectId, contentId: issueNodeId });

    const itemId = addResult.addProjectV2ItemById.item.id;

    // Set status if specified
    if (statusColumn && itemId) {
      await setIssueStatus(companyId, itemId, statusColumn);
    }
  } catch (err: any) {
    console.warn(`   ⚠️  Add issue to project: ${err.message}`);
  }
}

/**
 * Updates the status column of an issue in the project.
 */
export async function setIssueStatus(
  companyId: string,
  itemId: string,
  statusName: string
): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company?.projectId) return;

  const gql = graphql.defaults({
    headers: { authorization: `token ${company.githubToken}` },
  });

  try {
    // Get status field and find option ID
    const fieldsData: any = await gql(`
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            fields(first: 20) {
              nodes {
                ... on ProjectV2SingleSelectField {
                  id name options { id name }
                }
              }
            }
          }
        }
      }
    `, { projectId: company.projectId });

    const statusField = fieldsData.node.fields.nodes.find(
      (f: any) => f.name === "Status" && f.options
    );
    if (!statusField) return;

    const option = statusField.options.find((o: any) => o.name === statusName);
    if (!option) return;

    await gql(`
      mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
        updateProjectV2ItemFieldValue(input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: { singleSelectOptionId: $optionId }
        }) {
          projectV2Item { id }
        }
      }
    `, {
      projectId: company.projectId,
      itemId,
      fieldId: statusField.id,
      optionId: option.id,
    });
  } catch (err: any) {
    console.warn(`   ⚠️  Set status "${statusName}": ${err.message}`);
  }
}

/**
 * Checks if a response contains a completion pattern and handles the issue lifecycle.
 * Returns true if the issue was completed.
 */
export function detectCompletion(responseText: string, lifecycle: IssueLifecycle): boolean {
  return lifecycle.completionPatterns.some((pattern) =>
    responseText.includes(pattern)
  );
}
