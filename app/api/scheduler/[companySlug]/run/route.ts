// app/api/scheduler/[companySlug]/run/route.ts
// Disparar um agente específico imediatamente (sem aguardar o próximo tick).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import path from "path";
import { spawn } from "child_process";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const body = await req.json();
  const agentId = body?.agentId as string | undefined;

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  }

  const schedulerPath = path.join(process.cwd(), "scheduler", "index.ts");

  const args = ["--import", "tsx", schedulerPath, `--company=${companySlug}`, "--run-now"];
  if (agentId) args.push(`--agent=${agentId}`);

  // Next.js roda em Node — executa o node atual com o loader tsx (sem shell).
  const exitCode: number = await new Promise((resolve) => {
    const proc = spawn(process.execPath, args, { stdio: "ignore" });
    proc.on("close", (code) => resolve(code ?? 1));
    proc.on("error", () => resolve(1));
  });

  return NextResponse.json({
    status: exitCode === 0 ? "COMPLETED" : "ERROR",
    agentId: agentId ?? "all",
    exitCode,
  });
}
