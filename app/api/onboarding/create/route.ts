// app/api/onboarding/create/route.ts
// Materializa um ProjectPlan (revisado pelo usuário) em uma empresa real.

import { NextRequest, NextResponse } from "next/server";
import { materializePlan } from "../../../../lib/onboarding/materialize";
import { validateToken } from "../../../../lib/github/token-validator";
import { ProjectPlan } from "../../../../lib/onboarding/architect";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const plan = body?.plan as ProjectPlan | undefined;
  const defaultProviderSlug = typeof body?.providerSlug === "string" ? body.providerSlug : "";
  const defaultModel = typeof body?.model === "string" ? body.model : "";
  const githubToken = typeof body?.githubToken === "string" ? body.githubToken.trim() : "";
  const githubOwner = typeof body?.githubOwner === "string" ? body.githubOwner.trim() : "";

  if (!plan || !plan.slug || !plan.companyName) {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }

  // Se GitHub foi informado, valida o token antes.
  let github: { token: string; owner: string } | undefined;
  if (githubToken && githubOwner) {
    const validation = await validateToken(githubToken);
    if (!validation.valid) {
      return NextResponse.json(
        { error: "Token GitHub inválido.", details: validation.message },
        { status: 400 }
      );
    }
    github = { token: githubToken, owner: githubOwner };
  }

  try {
    const result = await materializePlan({
      plan,
      defaultProviderSlug,
      defaultModel,
      github,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
