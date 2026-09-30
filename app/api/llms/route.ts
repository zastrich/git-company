// app/api/llms/route.ts
//
// Configuração GLOBAL de LLMs (antes de qualquer projeto).
// - GET  → lista providers do catálogo + se a credencial global está configurada
// - POST → cria/atualiza um provider e (opcional) grava o token global (write-only)
// - DELETE → remove um provider do catálogo (por slug)

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/db/client";
import { upsertSecret, providerSecretKey } from "../../../lib/db/secrets";
import { getSystemCompanyId } from "../../../lib/db/system-tenant";

const FIXED_KEY_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  bedrock: "AWS_BEDROCK_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
};

/** Chave de secret esperada para um provider (global). Vazia = não precisa. */
function keyForProvider(type: string, slug: string): string {
  if (type === "custom" || type === "kiro-cli") return providerSecretKey(slug);
  if (type === "ollama" || type === "local") return "";
  return FIXED_KEY_MAP[type] ?? "";
}

export async function GET() {
  const systemId = await getSystemCompanyId();
  const providers = await prisma.aIProvider.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { agents: true } } },
  });
  const secrets = await prisma.companySecret.findMany({
    where: { companyId: systemId },
    select: { key: true },
  });
  const haveKeys = new Set(secrets.map((s) => s.key));

  const result = providers.map((p) => {
    const key = keyForProvider(p.type, p.slug);
    return {
      slug: p.slug,
      name: p.name,
      type: p.type,
      baseUrl: p.baseUrl,
      isLocal: p.isLocal,
      agentsCount: p._count.agents,
      secretKey: key || null,
      credentialConfigured: key ? haveKeys.has(key) : true, // local/ollama não precisam
    };
  });

  return NextResponse.json({ providers: result });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const slug = typeof body?.slug === "string" ? body.slug.trim() : "";
  const type = typeof body?.type === "string" ? body.type : "";
  const baseUrl = typeof body?.baseUrl === "string" ? body.baseUrl.trim() : "";
  const isLocal = Boolean(body?.isLocal);
  const token = typeof body?.token === "string" ? body.token.trim() : "";

  if (!name || !slug || !type) {
    return NextResponse.json({ error: "name, slug e type são obrigatórios." }, { status: 400 });
  }
  if (type === "custom" && !baseUrl) {
    return NextResponse.json({ error: "Provider custom requer Base URL." }, { status: 400 });
  }

  const provider = await prisma.aIProvider.upsert({
    where: { slug },
    update: { name, type, baseUrl: baseUrl || null, isLocal },
    create: { name, slug, type, baseUrl: baseUrl || null, isLocal },
  });

  // grava token global (write-only) se informado
  if (token) {
    const key = keyForProvider(type, slug);
    if (key) {
      const systemId = await getSystemCompanyId();
      await upsertSecret(systemId, key, token);
    }
  }

  return NextResponse.json({ ok: true, slug: provider.slug }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug é obrigatório." }, { status: 400 });

  const provider = await prisma.aIProvider.findUnique({
    where: { slug },
    include: { _count: { select: { agents: true } } },
  });
  if (!provider) return NextResponse.json({ error: "Provider não encontrado." }, { status: 404 });
  if (provider._count.agents > 0) {
    return NextResponse.json(
      { error: `Provider em uso por ${provider._count.agents} agente(s). Remaneje-os antes.` },
      { status: 400 }
    );
  }

  await prisma.aIProvider.delete({ where: { slug } });
  return NextResponse.json({ ok: true });
}
