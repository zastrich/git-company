// app/api/chat/[companySlug]/[agentId]/route.ts
// API de chat com agentes. GET = histórico, POST = enviar mensagem.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { sendMessage, getChatHistory, ContextWindow } from "../../../../../lib/chat/chat-service";

// ─────────────────────────────────────────────
// GET — Histórico de mensagens
// ─────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string; agentId: string }> }
) {
  const { companySlug, agentId } = await params;
  const contextWindow = (req.nextUrl.searchParams.get("window") ?? "30d") as ContextWindow;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const agentConfig = await prisma.agentConfig.findFirst({
    where: { companyId: company.id, agentId },
  });
  if (!agentConfig) {
    return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  const messages = await getChatHistory(company.id, agentConfig.id, contextWindow);

  return NextResponse.json({ messages, contextWindow });
}

// ─────────────────────────────────────────────
// POST — Enviar mensagem e receber resposta
// ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string; agentId: string }> }
) {
  const { companySlug, agentId } = await params;
  const body = await req.json();
  const message = body?.message as string;
  const contextWindow = (body?.contextWindow ?? "30d") as ContextWindow;

  if (!message || typeof message !== "string") {
    return NextResponse.json({ error: "Campo 'message' é obrigatório." }, { status: 400 });
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  const agentConfig = await prisma.agentConfig.findFirst({
    where: { companyId: company.id, agentId },
  });
  if (!agentConfig) {
    return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  }

  try {
    const response = await sendMessage({
      companyId: company.id,
      agentConfigId: agentConfig.id,
      agentId,
      message,
      contextWindow,
    });

    return NextResponse.json(response);
  } catch (error: any) {
    console.error("[Chat API] Error:", error.message);
    return NextResponse.json(
      { error: "Erro ao processar mensagem.", details: error.message },
      { status: 500 }
    );
  }
}
