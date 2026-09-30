// app/api/secrets/[companySlug]/route.ts
//
// API de segredos WRITE-ONLY.
// - GET    → devolve apenas NOMES/metadados das chaves (nunca o valor)
// - POST   → grava/atualiza um secret (não ecoa o valor)
// - DELETE → remove um secret
//
// Política: o valor de um secret NUNCA é retornado por nenhum endpoint.
// Só pode ser gravado ou substituído.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { upsertSecret, deleteSecret, listSecretMeta } from "../../../../lib/db/secrets";

async function resolveCompany(companySlug: string) {
  return prisma.company.findUnique({ where: { slug: companySlug } });
}

// ─────────────────────────────────────────────
// GET — apenas nomes/metadados (sem valores)
// ─────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const company = await resolveCompany(companySlug);
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const secrets = await listSecretMeta(company.id);
  return NextResponse.json({ secrets });
}

// ─────────────────────────────────────────────
// POST — gravar/atualizar (write-only)
// ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const company = await resolveCompany(companySlug);
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  const value = typeof body?.value === "string" ? body.value : "";

  if (!key || !/^[A-Z0-9_]+$/.test(key)) {
    return NextResponse.json(
      { error: "Chave inválida. Use apenas A-Z, 0-9 e _ (ex: OPENAI_API_KEY)." },
      { status: 400 }
    );
  }
  if (!value) {
    return NextResponse.json({ error: "Valor é obrigatório." }, { status: 400 });
  }

  await upsertSecret(company.id, key, value);

  // NUNCA retorna o valor — apenas confirma que foi gravado.
  return NextResponse.json({ ok: true, key, isSet: true }, { status: 201 });
}

// ─────────────────────────────────────────────
// DELETE — remover
// ─────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const company = await resolveCompany(companySlug);
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Parâmetro 'key' é obrigatório." }, { status: 400 });
  }

  await deleteSecret(company.id, key);
  return NextResponse.json({ ok: true, key });
}
