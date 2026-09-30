// app/api/onboarding/import/route.ts
// Importa um projeto existente a partir do business.json de um repositório GitHub.

import { NextRequest, NextResponse } from "next/server";
import { importFromRepo } from "../../../../lib/onboarding/import";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const owner = typeof body?.owner === "string" ? body.owner.trim() : "";
  const repo = typeof body?.repo === "string" ? body.repo.trim() : "";

  if (!token || !owner || !repo) {
    return NextResponse.json(
      { error: "Campos owner, repo e token são obrigatórios." },
      { status: 400 }
    );
  }

  try {
    const result = await importFromRepo({ token, owner, repo });
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
