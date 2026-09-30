// app/api/company/[slug]/labels/route.ts
// Etiquetas direto no GitHub (fonte da verdade).
//   GET    → lista labels
//   POST   → cria label
//   PUT    → edita label (currentName + novos valores)
//   DELETE → remove label (?name=)

import { NextRequest, NextResponse } from "next/server";
import { resolveRepo, listLabels, createLabel, updateLabel, deleteLabel } from "../../../../../lib/github/dashboard-service";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const ref = await resolveRepo(slug);
    const labels = await listLabels(ref);
    return NextResponse.json({ labels });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.name) return NextResponse.json({ error: "name é obrigatório." }, { status: 400 });
  try {
    const ref = await resolveRepo(slug);
    await createLabel(ref, { name: body.name, color: body.color ?? "cccccc", description: body.description ?? "" });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  if (!body?.currentName || !body?.name) {
    return NextResponse.json({ error: "currentName e name são obrigatórios." }, { status: 400 });
  }
  try {
    const ref = await resolveRepo(slug);
    await updateLabel(ref, body.currentName, { name: body.name, color: body.color ?? "cccccc", description: body.description ?? "" });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = req.nextUrl.searchParams.get("name");
  if (!name) return NextResponse.json({ error: "name é obrigatório." }, { status: 400 });
  try {
    const ref = await resolveRepo(slug);
    await deleteLabel(ref, name);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
