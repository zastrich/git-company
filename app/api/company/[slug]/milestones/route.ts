// app/api/company/[slug]/milestones/route.ts
// Milestones direto no GitHub. GET lista, POST cria.

import { NextRequest, NextResponse } from "next/server";
import { resolveRepo, listMilestones, createMilestone } from "../../../../../lib/github/dashboard-service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ref = await resolveRepo(slug);
    const milestones = await listMilestones(ref);
    return NextResponse.json({ milestones });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: "title é obrigatório." }, { status: 400 });
  try {
    const ref = await resolveRepo(slug);
    await createMilestone(ref, { title: body.title, description: body.description, dueOn: body.dueOn ?? null });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
