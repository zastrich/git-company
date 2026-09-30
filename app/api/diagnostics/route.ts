// app/api/diagnostics/route.ts
//
// Diagnóstico do ambiente:
//   GET  → estado do token GitHub global (configurado? válido? scopes ok?)
//   POST → grava o token GitHub global (write-only) e revalida
//
// Objetivo: garantir que o uso via CLI funcione sem configuração manual.

import { NextRequest, NextResponse } from "next/server";
import { validateToken, REQUIRED_SCOPES, RECOMMENDED_SCOPES } from "../../../lib/github/token-validator";
import { getGlobalGitHubToken, setGlobalGitHubToken } from "../../../lib/github/global-token";

async function buildStatus() {
  const token = await getGlobalGitHubToken();
  if (!token) {
    return {
      configured: false,
      valid: false,
      login: "",
      currentScopes: [] as string[],
      missingRequired: [...REQUIRED_SCOPES],
      missingRecommended: [...RECOMMENDED_SCOPES],
      message: "Nenhum token GitHub global configurado.",
    };
  }
  const v = await validateToken(token);
  return {
    configured: true,
    valid: v.valid,
    login: v.login,
    currentScopes: v.currentScopes,
    missingRequired: v.missingRequired,
    missingRecommended: v.missingRecommended,
    message: v.message,
  };
}

export async function GET() {
  const github = await buildStatus();
  return NextResponse.json({ github });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json({ error: "Token é obrigatório." }, { status: 400 });
  }

  // Valida antes de gravar para dar feedback imediato.
  const v = await validateToken(token);
  await setGlobalGitHubToken(token);

  return NextResponse.json({
    ok: true,
    github: {
      configured: true,
      valid: v.valid,
      login: v.login,
      currentScopes: v.currentScopes,
      missingRequired: v.missingRequired,
      missingRecommended: v.missingRecommended,
      message: v.message,
    },
  });
}
