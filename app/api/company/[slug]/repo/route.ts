// app/api/company/[slug]/repo/route.ts
//
// Gerencia o repositório GitHub vinculado ao projeto.
//   POST { action: "check", owner, repo }  → informa se o repo já existe no GitHub
//   POST { action: "link",  owner, repo }  → aponta o projeto para um repo existente
//   POST { action: "create",owner, repo }  → cria o repo, faz push do business.json
//
// Usa o token GitHub GLOBAL (write-only). Requer token configurado no diagnóstico.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { getGlobalGitHubToken } from "../../../../../lib/github/global-token";
import { createAuditLog } from "../../../../../lib/db/audit";

async function repoExists(token: string, owner: string, repo: string): Promise<boolean> {
  const { Octokit } = await import("@octokit/rest");
  const octokit = new Octokit({ auth: token });
  try {
    await octokit.rest.repos.get({ owner, repo });
    return true;
  } catch (e: any) {
    if (e.status === 404) return false;
    throw e;
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const action = body?.action as "check" | "link" | "create" | undefined;
  const owner = typeof body?.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body?.repo === "string" ? body.repo.trim() : "";

  if (!action || !owner || !repo) {
    return NextResponse.json({ error: "action, owner e repo são obrigatórios." }, { status: 400 });
  }

  const token = await getGlobalGitHubToken();
  if (!token) {
    return NextResponse.json(
      { error: "Token GitHub global não configurado. Abra o Diagnóstico." },
      { status: 400 }
    );
  }

  try {
    if (action === "check") {
      const exists = await repoExists(token, owner, repo);
      return NextResponse.json({ exists });
    }

    if (action === "link") {
      const exists = await repoExists(token, owner, repo);
      if (!exists) {
        return NextResponse.json({ error: "Repositório não existe para vincular." }, { status: 400 });
      }
      await prisma.company.update({
        where: { id: company.id },
        data: { githubOwner: owner, repoName: repo, githubToken: token },
      });
      await createAuditLog({ companyId: company.id, agentName: "System", action: "REPO_LINKED", details: { owner, repo } });
      return NextResponse.json({ ok: true, linked: `${owner}/${repo}` });
    }

    if (action === "create") {
      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: token });

      const already = await repoExists(token, owner, repo);
      if (already) {
        return NextResponse.json(
          { error: "Repositório já existe. Escolha vincular ao existente ou use outro nome.", exists: true },
          { status: 409 }
        );
      }

      await octokit.rest.repos.createForAuthenticatedUser({
        name: repo,
        description: `Organograma de ${company.name} — GitCompany-AI`,
        private: true,
        auto_init: true,
      });

      await prisma.company.update({
        where: { id: company.id },
        data: { githubOwner: owner, repoName: repo, githubToken: token },
      });

      // push inicial do business.json
      const { pushToRemote } = await import("../../../../../lib/sync/org-sync");
      await pushToRemote(company.id);

      await createAuditLog({ companyId: company.id, agentName: "System", action: "REPO_CREATED", details: { owner, repo } });
      return NextResponse.json({ ok: true, created: `${owner}/${repo}` }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
