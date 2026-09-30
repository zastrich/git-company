// app/api/onboarding/plan/route.ts
// Gera um plano de projeto a partir de uma descrição, usando a LLM escolhida.

import { NextRequest, NextResponse } from "next/server";
import { generateProjectPlan } from "../../../../lib/onboarding/architect";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const providerSlug = typeof body?.providerSlug === "string" ? body.providerSlug : "";
  const model = typeof body?.model === "string" ? body.model : "";

  if (!description) {
    return NextResponse.json({ error: "Descrição do projeto é obrigatória." }, { status: 400 });
  }
  if (!providerSlug) {
    return NextResponse.json({ error: "Selecione uma LLM (provider)." }, { status: 400 });
  }

  try {
    const { plan, source } = await generateProjectPlan({ description, providerSlug, model });
    return NextResponse.json({ plan, source });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Falha ao gerar plano.", details: err.message },
      { status: 500 }
    );
  }
}
