// app/api/company/[slug]/agents/route.ts
// CRUD de agentes de uma empresa.
//   POST   → criar agente
//   PUT    → editar agente (por agentId)
//   DELETE → remover agente (?agentId=)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createAuditLog } from "../../../../../lib/db/audit";
import { markDirty } from "../../../../../lib/sync/dirty";

async function resolveCompany(slug: string) {
  return prisma.company.findUnique({ where: { slug } });
}

interface AgentBody {
  agentId?: string;
  role?: string;
  type?: "ai" | "human";
  context?: string;
  providerSlug?: string | null;
  model?: string;
  tickIntervalSeconds?: number;
  labels?: string; // csv
  subordinates?: string; // csv de agentIds
  isCeo?: boolean;
  githubUsername?: string;
}

async function providerIdFromSlug(slug: string | null | undefined): Promise<string | null> {
  if (!slug) return null;
  const p = await prisma.aIProvider.findUnique({ where: { slug } });
  return p?.id ?? null;
}

// ── POST: criar ──────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const company = await resolveCompany(slug);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as AgentBody | null;
  const agentId = body?.agentId?.trim();
  const role = body?.role?.trim();
  const type = body?.type === "human" ? "human" : "ai";

  if (!agentId || !role) {
    return NextResponse.json({ error: "agentId e role são obrigatórios." }, { status: 400 });
  }

  const exists = await prisma.agentConfig.findUnique({
    where: { companyId_agentId: { companyId: company.id, agentId } },
  });
  if (exists) return NextResponse.json({ error: `Agente "${agentId}" já existe.` }, { status: 400 });

  const providerId = type === "human" ? null : await providerIdFromSlug(body?.providerSlug);
  const interval = Math.max(body?.tickIntervalSeconds ?? 3600, 300);

  await prisma.agentConfig.create({
    data: {
      companyId: company.id,
      agentId,
      role,
      type,
      context: body?.context ?? "",
      providerId,
      model: type === "human" ? "" : (body?.model ?? ""),
      tickIntervalSeconds: interval,
      labels: body?.labels ?? "",
      subordinates: body?.subordinates ?? "",
      isCeo: Boolean(body?.isCeo),
      githubUsername: body?.githubUsername ?? "",
    },
  });

  await markDirty(company.id);
  await createAuditLog({ companyId: company.id, agentId, agentName: role, action: "AGENT_CREATED", details: { type } });
  return NextResponse.json({ ok: true, agentId }, { status: 201 });
}

// ── PUT: editar ──────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const company = await resolveCompany(slug);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as AgentBody | null;
  const agentId = body?.agentId?.trim();
  if (!agentId) return NextResponse.json({ error: "agentId é obrigatório." }, { status: 400 });

  const agent = await prisma.agentConfig.findUnique({
    where: { companyId_agentId: { companyId: company.id, agentId } },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const type = body?.type === "human" ? "human" : body?.type === "ai" ? "ai" : agent.type;
  const providerId =
    type === "human"
      ? null
      : body?.providerSlug !== undefined
      ? await providerIdFromSlug(body.providerSlug)
      : agent.providerId;

  const data: any = { type, providerId };
  if (body?.role !== undefined) data.role = body.role;
  if (body?.context !== undefined) data.context = body.context;
  if (body?.model !== undefined) data.model = type === "human" ? "" : body.model;
  if (body?.tickIntervalSeconds !== undefined) data.tickIntervalSeconds = Math.max(body.tickIntervalSeconds, 300);
  if (body?.labels !== undefined) data.labels = body.labels;
  if (body?.subordinates !== undefined) data.subordinates = body.subordinates;
  if (body?.isCeo !== undefined) data.isCeo = Boolean(body.isCeo);
  if (body?.githubUsername !== undefined) data.githubUsername = body.githubUsername;

  await prisma.agentConfig.update({ where: { id: agent.id }, data });
  await markDirty(company.id);
  await createAuditLog({ companyId: company.id, agentId, agentName: agent.role, action: "AGENT_UPDATED", details: {} });
  return NextResponse.json({ ok: true, agentId });
}

// ── DELETE: remover ──────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const company = await resolveCompany(slug);
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const agentId = req.nextUrl.searchParams.get("agentId");
  if (!agentId) return NextResponse.json({ error: "agentId é obrigatório." }, { status: 400 });

  const agent = await prisma.agentConfig.findUnique({
    where: { companyId_agentId: { companyId: company.id, agentId } },
  });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.agentConfig.delete({ where: { id: agent.id } });
  await markDirty(company.id);
  await createAuditLog({ companyId: company.id, agentId, agentName: agent.role, action: "AGENT_DELETED", details: {} });
  return NextResponse.json({ ok: true });
}
