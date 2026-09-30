// app/api/scheduler/[companySlug]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { spawn } from "child_process";
import { schedulerCommand } from "../../../../lib/runtime-paths";

// ─────────────────────────────────────────────
// GET — Status atual do scheduler
// ─────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;

  const company = await prisma.company.findUnique({
    where: { slug: companySlug },
    include: { schedulers: { orderBy: { updatedAt: "desc" }, take: 1 } },
  });

  if (!company) {
    return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  }

  const scheduler = company.schedulers[0] ?? null;

  return NextResponse.json({
    companySlug,
    status: scheduler?.status ?? "STOPPED",
    pid: scheduler?.pid ?? null,
    startedAt: scheduler?.startedAt ?? null,
    stoppedAt: scheduler?.stoppedAt ?? null,
  });
}

// ─────────────────────────────────────────────
// POST — Iniciar ou parar o scheduler
// ─────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const body = await req.json();
  const action = body?.action as "start" | "stop" | undefined;

  if (!action || !["start", "stop"].includes(action)) {
    return NextResponse.json(
      { error: 'Campo "action" deve ser "start" ou "stop".' },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
  }

  const schedulerRecord = await prisma.schedulerProcess.findFirst({
    where: { companyId: company.id },
    orderBy: { updatedAt: "desc" },
  });

  // ── START ──
  if (action === "start") {
    if (schedulerRecord?.status === "RUNNING") {
      return NextResponse.json({ status: "ALREADY_RUNNING", pid: schedulerRecord.pid });
    }

    // Resolve o comando conforme o modo (clone/dev via tsx, ou pacote npm via node).
    const { cmd, args } = schedulerCommand([`--company=${companySlug}`]);

    // Log de erros do processo detached em ~/.gitcompany/scheduler-<slug>.log
    // (stdio:"ignore" escondia crashes, ex.: Prisma não inicializado no modo npx).
    const os = await import("os");
    const fs = await import("fs");
    const path = await import("path");
    const logDir = path.join(os.homedir(), ".gitcompany");
    try { fs.mkdirSync(logDir, { recursive: true }); } catch { /* ignore */ }
    const logFile = path.join(logDir, `scheduler-${companySlug}.log`);
    const errFd = fs.openSync(logFile, "a");

    // O scheduler (scheduler/index.ts) sincroniza o @prisma/client gerado do
    // bundle standalone por conta própria no modo npx. Aqui apenas garantimos
    // que DATABASE_URL seja repassado explicitamente ao filho (além da herança).
    const proc = spawn(cmd, args, {
      detached: true,
      stdio: ["ignore", errFd, errFd],
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });

    proc.unref(); // Não bloqueia o processo Next.js

    // Salvar PID no banco (o scheduler também atualiza por conta própria)
    await prisma.schedulerProcess.upsert({
      where: { id: `${company.id}-scheduler` },
      update: { status: "RUNNING", startedAt: new Date(), pid: proc.pid, stoppedAt: null },
      create: {
        id: `${company.id}-scheduler`,
        companyId: company.id,
        pid: proc.pid,
        status: "RUNNING",
        startedAt: new Date(),
      },
    });

    return NextResponse.json({ status: "STARTED", pid: proc.pid });
  }

  // ── STOP ──
  if (action === "stop") {
    if (!schedulerRecord || schedulerRecord.status !== "RUNNING") {
      return NextResponse.json({ status: "NOT_RUNNING" });
    }

    if (schedulerRecord.pid) {
      try {
        process.kill(schedulerRecord.pid, "SIGTERM");
      } catch {
        // Processo pode já ter sido encerrado
      }
    }

    await prisma.schedulerProcess.update({
      where: { id: schedulerRecord.id },
      data: { status: "STOPPED", stoppedAt: new Date(), pid: null },
    });

    return NextResponse.json({ status: "STOPPED" });
  }
}
