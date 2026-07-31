// app/api/scheduler/[companySlug]/run/route.ts
// Disparar um agente específico imediatamente (sem aguardar o próximo tick).

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import path from "path";

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

  const args = [
    "bun",
    "run",
    schedulerPath,
    `--company=${companySlug}`,
    "--run-now",
  ];

  if (agentId) {
    args.push(`--agent=${agentId}`);
  }

  const proc = Bun.spawn(args, {
    stdout: "pipe",
    stderr: "pipe",
  });

  // Aguardar conclusão (processo --run-now termina sozinho)
  const exitCode = await proc.exited;

  return NextResponse.json({
    status: exitCode === 0 ? "COMPLETED" : "ERROR",
    agentId: agentId ?? "all",
    exitCode,
  });
}
