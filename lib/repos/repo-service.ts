// lib/repos/repo-service.ts
// Single Responsibility: Manage company repositories and their reference labels.
//
// Label format: "repo:<shortId>" (max 50 chars total, so shortId max ~45 chars)
// Example: repo:api, repo:frontend, repo:docs, repo:mobile
//
// This allows agents to filter issues by repo context and know which
// codebase they should be working on.

import { prisma } from "../db/client";
import { Octokit } from "@octokit/rest";
import { createAuditLog } from "../db/audit";

const REPO_LABEL_PREFIX = "repo:";
const REPO_LABEL_COLOR = "1d76db"; // Blue color for repo labels

export interface RegisterRepoInput {
  companyId: string;
  shortId: string;       // Short identifier (e.g., "api", "frontend")
  fullName?: string;     // Full repo name. If omitted, uses prefix + shortId
  description?: string;  // Purpose of the repo
  createOnGitHub?: boolean; // Whether to create the repo on GitHub
}

export interface RepoInfo {
  id: string;
  shortId: string;
  fullName: string;
  label: string;         // The GitHub label name (repo:<shortId>)
  description: string;
}

/**
 * Generates the GitHub label name for a repo reference.
 */
export function repoLabel(shortId: string): string {
  return `${REPO_LABEL_PREFIX}${shortId}`;
}

/**
 * Registers a new repository for a company.
 * Optionally creates it on GitHub and adds the corresponding label to the org repo.
 */
export async function registerRepo(input: RegisterRepoInput): Promise<RepoInfo> {
  const company = await prisma.company.findUnique({ where: { id: input.companyId } });
  if (!company) throw new Error("Empresa não encontrada.");

  const fullName = input.fullName ?? `${company.repoPrefix}${input.shortId}`;
  const label = repoLabel(input.shortId);

  // Validate label length (GitHub max is 50)
  if (label.length > 50) {
    throw new Error(`Label "${label}" excede 50 caracteres. Use um shortId menor.`);
  }

  // Save to DB
  const repo = await prisma.companyRepo.upsert({
    where: { companyId_shortId: { companyId: input.companyId, shortId: input.shortId } },
    update: { fullName, description: input.description ?? "" },
    create: {
      companyId: input.companyId,
      shortId: input.shortId,
      fullName,
      description: input.description ?? "",
    },
  });

  const octokit = new Octokit({ auth: company.githubToken });

  // Create the repo on GitHub if requested
  if (input.createOnGitHub) {
    try {
      await octokit.rest.repos.createForAuthenticatedUser({
        name: fullName,
        description: input.description ?? `Repo ${input.shortId} da empresa ${company.name}`,
        private: true,
        auto_init: true,
      });
    } catch (err: any) {
      if (err.status !== 422) throw err; // 422 = already exists
    }
  }

  // Add the repo label to the org repository (where issues are managed)
  try {
    await octokit.rest.issues.createLabel({
      owner: company.githubOwner,
      repo: company.repoName,
      name: label,
      color: REPO_LABEL_COLOR,
      description: `Repo: ${company.githubOwner}/${fullName}${input.description ? ` — ${input.description}` : ""}`,
    });
  } catch (err: any) {
    if (err.status === 422) {
      // Label already exists — update it
      await octokit.rest.issues.updateLabel({
        owner: company.githubOwner,
        repo: company.repoName,
        name: label,
        color: REPO_LABEL_COLOR,
        description: `Repo: ${company.githubOwner}/${fullName}${input.description ? ` — ${input.description}` : ""}`,
      });
    } else {
      console.warn(`[RepoService] Failed to create label "${label}":`, err.message);
    }
  }

  await createAuditLog({
    companyId: input.companyId,
    agentName: "System",
    action: "REPO_REGISTERED",
    details: { shortId: input.shortId, fullName, label },
  });

  return {
    id: repo.id,
    shortId: input.shortId,
    fullName,
    label,
    description: input.description ?? "",
  };
}

/**
 * Lists all registered repos for a company.
 */
export async function listRepos(companyId: string): Promise<RepoInfo[]> {
  const repos = await prisma.companyRepo.findMany({
    where: { companyId },
    orderBy: { createdAt: "asc" },
  });

  return repos.map((r) => ({
    id: r.id,
    shortId: r.shortId,
    fullName: r.fullName,
    label: repoLabel(r.shortId),
    description: r.description,
  }));
}

/**
 * Resolves a repo label back to the full repo info.
 * Useful for agents to understand which repo context they're in.
 */
export async function resolveRepoFromLabel(
  companyId: string,
  label: string
): Promise<RepoInfo | null> {
  if (!label.startsWith(REPO_LABEL_PREFIX)) return null;

  const shortId = label.slice(REPO_LABEL_PREFIX.length);
  const repo = await prisma.companyRepo.findUnique({
    where: { companyId_shortId: { companyId, shortId } },
  });

  if (!repo) return null;

  return {
    id: repo.id,
    shortId: repo.shortId,
    fullName: repo.fullName,
    label,
    description: repo.description,
  };
}

/**
 * Syncs all repo labels to the org repository on GitHub.
 * Useful after a bulk import or config change.
 */
export async function syncRepoLabels(companyId: string): Promise<void> {
  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new Error("Empresa não encontrada.");

  const repos = await prisma.companyRepo.findMany({ where: { companyId } });
  const octokit = new Octokit({ auth: company.githubToken });

  for (const repo of repos) {
    const label = repoLabel(repo.shortId);
    try {
      await octokit.rest.issues.createLabel({
        owner: company.githubOwner,
        repo: company.repoName,
        name: label,
        color: REPO_LABEL_COLOR,
        description: `Repo: ${company.githubOwner}/${repo.fullName}`,
      });
    } catch (err: any) {
      if (err.status === 422) {
        await octokit.rest.issues.updateLabel({
          owner: company.githubOwner,
          repo: company.repoName,
          name: label,
          color: REPO_LABEL_COLOR,
          description: `Repo: ${company.githubOwner}/${repo.fullName}`,
        });
      }
    }
  }
}
