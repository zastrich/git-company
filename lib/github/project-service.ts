// lib/github/project-service.ts
// Single Responsibility: Manage GitHub Projects V2 for task orchestration.
// Creates/configures projects with custom views (Kanban, Roadmap, Table).

import { prisma } from "../db/client";
import { graphql } from "@octokit/graphql";

export interface ProjectConfig {
  title: string;
  views: { name: string; layout: "BOARD_LAYOUT" | "ROADMAP_LAYOUT" | "TABLE_LAYOUT" }[];
}

/**
 * Creates or finds a GitHub Project V2 for a company and configures its views.
 * Returns the project ID (node_id).
 */
export async function ensureProjectV2(companyId: string, config?: ProjectConfig): Promise<string | null> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa não encontrada.");

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${company.githubToken}` },
  });

  const projectTitle = config?.title ?? `${company.name} — Tasks`;

  // Check if project already exists
  if (company.projectId) {
    return company.projectId;
  }

  // Create project for the user (not org)
  try {
    // Get user node ID first
    const userData: any = await graphqlWithAuth(`query { viewer { id } }`);
    const ownerId = userData.viewer.id;

    // Create Project V2
    const createResult: any = await graphqlWithAuth(`
      mutation($ownerId: ID!, $title: String!) {
        createProjectV2(input: { ownerId: $ownerId, title: $title }) {
          projectV2 { id number url }
        }
      }
    `, { ownerId, title: projectTitle });

    const projectId = createResult.createProjectV2.projectV2.id;
    const projectUrl = createResult.createProjectV2.projectV2.url;

    console.log(`   ✅ Project V2 criado: ${projectUrl}`);

    // Save project ID to company
    await prisma.company.update({
      where: { id: companyId },
      data: { projectId },
    });

    // Create custom views
    const views = config?.views ?? [
      { name: "Backlog", layout: "TABLE_LAYOUT" as const },
      { name: "Sprint Board", layout: "BOARD_LAYOUT" as const },
      { name: "Roadmap", layout: "ROADMAP_LAYOUT" as const },
    ];

    for (const view of views) {
      try {
        await graphqlWithAuth(`
          mutation($projectId: ID!, $name: String!, $layout: ProjectV2ViewLayout!) {
            createProjectV2View(input: { projectId: $projectId, name: $name, layout: $layout }) {
              projectV2View { id name }
            }
          }
        `, { projectId, name: view.name, layout: view.layout });
        console.log(`   ✅ View "${view.name}" criada.`);
      } catch (err: any) {
        console.warn(`   ⚠️  View "${view.name}": ${err.message}`);
      }
    }

    return projectId;
  } catch (error: any) {
    console.error(`   ❌ Erro ao criar Project V2: ${error.message}`);
    return null;
  }
}

/**
 * Links a repository to a Project V2 (adds it as a linked repository).
 */
export async function linkRepoToProject(
  companyId: string,
  repoFullName: string
): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company || !company.projectId) return;

  const graphqlWithAuth = graphql.defaults({
    headers: { authorization: `token ${company.githubToken}` },
  });

  try {
    // Get repo node ID
    const repoData: any = await graphqlWithAuth(`
      query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) { id }
      }
    `, { owner: company.githubOwner, name: repoFullName });

    const repoId = repoData.repository.id;

    // Link repo to project
    await graphqlWithAuth(`
      mutation($projectId: ID!, $repositoryId: ID!) {
        linkProjectV2ToRepository(input: { projectId: $projectId, repositoryId: $repositoryId }) {
          repository { id }
        }
      }
    `, { projectId: company.projectId, repositoryId: repoId });
  } catch (err: any) {
    // Silently ignore — may not have permissions or already linked
    console.warn(`   ⚠️  Link repo "${repoFullName}" to project: ${err.message}`);
  }
}
