// app/api/company/[slug]/route.ts
// Edição dos dados da empresa (nome, missão, prefixo).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { createAuditLog } from "../../../../lib/db/audit";
import { markDirty } from "../../../../lib/sync/dirty";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const data: Record<string, string> = {};
  if (typeof body?.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body?.mission === "string") data.mission = body.mission;
  if (typeof body?.repoPrefix === "string") data.repoPrefix = body.repoPrefix;
  if (typeof body?.githubOwner === "string") data.githubOwner = body.githubOwner.trim();
  if (typeof body?.repoName === "string") data.repoName = body.repoName.trim();

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });
  }

  const updated = await prisma.company.update({ where: { id: company.id }, data });
  await markDirty(company.id);
  await createAuditLog({
    companyId: company.id,
    agentName: "System",
    action: "COMPANY_UPDATED",
    details: { fields: Object.keys(data) },
  });

  return NextResponse.json({ ok: true, name: updated.name, mission: updated.mission, repoPrefix: updated.repoPrefix });
}

// ─────────────────────────────────────────────
// DELETE — remove o projeto APENAS do banco local.
// Não toca no repositório GitHub. Cascade apaga agents/secrets/logs/chat/etc.
// ─────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (slug === "__system__") {
    return NextResponse.json(
      { error: "O tenant de configuração global não pode ser removido." },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  // onDelete: Cascade nas relações remove agents, secrets, logs, chatMessages,
  // configs, repos e schedulers automaticamente.
  await prisma.company.delete({ where: { id: company.id } });

  return NextResponse.json({ ok: true, removed: slug });
}
