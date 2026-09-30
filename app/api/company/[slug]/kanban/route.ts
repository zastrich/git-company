// app/api/company/[slug]/kanban/route.ts
// Kanban lido/escrito direto no GitHub.
//   GET  → colunas (com contexto de etapa) + cards + agentes + milestones
//   POST → ações: create-project | sync-issues | create-issue | move-card | clone-issue

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import {
  resolveRepo, readKanban, getSavedProjectId, createProjectV2,
  createIssue, cloneIssue, moveCard, syncIssuesToProject, readStageContexts,
  listMilestones,
  type StageContext, type RelationType,
} from "../../../../../lib/github/dashboard-service";
import { buildLocalBusinessJson } from "../../../../../lib/sync/org-sync";
import { generateProjectPlan } from "../../../../../lib/onboarding/architect";

async function columnsFor(companyId: string): Promise<StageContext[]> {
  try {
    const business = await buildLocalBusinessJson(companyId);
    const cols = business.infrastructure?.project?.columns ?? [];
    if (cols.length) {
      return cols.map((c) => ({ name: c.name, description: c.description, isManualAction: c.isManualAction, isDone: c.isDone }));
    }
  } catch { /* fallback abaixo */ }
  return [
    { name: "Backlog" }, { name: "Em Progresso" }, { name: "Revisão" },
    { name: "Ação Manual", isManualAction: true }, { name: "Concluído", isDone: true },
  ];
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const company = await prisma.company.findUnique({ where: { slug } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  const companyId = company.id;

  // Estado LOCAL (independe do repo): fluxo configurado, assistente, providers.
  const wfCfg = await prisma.companyConfig.findUnique({ where: { companyId_key: { companyId, key: "workflow_stages" } } });
  let flowConfigured = true;
  if (wfCfg) { try { flowConfigured = (JSON.parse(wfCfg.value) as any[]).length > 0; } catch { flowConfigured = true; } }

  const provCfg = await prisma.companyConfig.findUnique({ where: { companyId_key: { companyId, key: "assistant_provider" } } });
  const modelCfg = await prisma.companyConfig.findUnique({ where: { companyId_key: { companyId, key: "assistant_model" } } });
  const availableProviders = await prisma.aIProvider.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true, type: true } });
  const agents = await prisma.agentConfig.findMany({ where: { companyId }, select: { agentId: true, role: true } });

  const localState = {
    flowConfigured,
    assistant: { providerSlug: provCfg?.value ?? "", model: modelCfg?.value ?? "" },
    availableProviders,
    agents: agents.map((a) => ({ agentId: a.agentId, role: a.role })),
  };

  // Estado REMOTO (precisa de repo GitHub). Se não houver, degrada com noRepo.
  try {
    const ref = await resolveRepo(slug);
    const localCols = await columnsFor(companyId);
    const remoteCtx = await readStageContexts(ref);
    const ctxByName = new Map(remoteCtx.map((s) => [s.name, s]));
    const columns = localCols.map((c) => ({ ...c, ...(ctxByName.get(c.name) ?? {}) }));

    const board = await readKanban(ref, columns.map((c) => c.name));
    const boardWithCtx = board.map((col) => ({ ...col, context: columns.find((c) => c.name === col.name) }));
    const projectId = await getSavedProjectId(companyId);
    const milestones = await listMilestones(ref).catch(() => []);

    return NextResponse.json({
      ...localState,
      board: boardWithCtx,
      projectId,
      noRepo: false,
      milestones: milestones.map((m) => ({ number: m.number, title: m.title })),
    });
  } catch (err: any) {
    // Sem repo/token: retorna estado local para permitir "Criar fluxo com IA".
    return NextResponse.json({
      ...localState,
      board: [],
      projectId: null,
      noRepo: true,
      repoMessage: err.message,
      milestones: [],
    });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const body = await req.json().catch(() => null);
  const action = body?.action as string;

  try {
    // generate-flow não exige repo GitHub (escreve o fluxo localmente).
    if (action === "generate-flow") {
      const company = await prisma.company.findUnique({ where: { slug } });
      if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

      const description = typeof body.description === "string" ? body.description : "";
      const providerSlug = typeof body.providerSlug === "string" ? body.providerSlug : "";
      const model = typeof body.model === "string" ? body.model : "";
      if (!providerSlug) return NextResponse.json({ error: "Selecione uma LLM." }, { status: 400 });

      const { plan, source } = await generateProjectPlan({
        description: description || `Fluxo de trabalho para o projeto ${company.name}.`,
        providerSlug, model, secretsCompanyId: company.id,
      });

      await prisma.companyConfig.upsert({
        where: { companyId_key: { companyId: company.id, key: "workflow_stages" } },
        update: { value: JSON.stringify(plan.columns) },
        create: { companyId: company.id, key: "workflow_stages", value: JSON.stringify(plan.columns) },
      });

      // se já houver Project V2 + repo, reconfigura Status/board
      const projectId = await getSavedProjectId(company.id);
      if (projectId) {
        try {
          const ref = await resolveRepo(slug);
          const { configureProjectStatusAndBoard } = await import("../../../../../lib/github/dashboard-service");
          await configureProjectStatusAndBoard(ref.token, projectId, plan.columns.map((c) => c.name));
        } catch { /* sem repo ou best-effort */ }
      }

      return NextResponse.json({ ok: true, columns: plan.columns, source }, { status: 201 });
    }

    const ref = await resolveRepo(slug);

    if (action === "create-project") {
      const company = await prisma.company.findUnique({ where: { id: ref.companyId } });
      const stages = (await columnsFor(ref.companyId)).map((c) => c.name);
      const projectId = await createProjectV2(ref, `${company?.name ?? slug} — Board`, stages);
      const synced = await syncIssuesToProject(ref, projectId);
      return NextResponse.json({ ok: true, projectId, synced }, { status: 201 });
    }

    if (action === "sync-issues") {
      const projectId = await getSavedProjectId(ref.companyId);
      if (!projectId) return NextResponse.json({ error: "Sem Project V2. Crie o projeto primeiro." }, { status: 400 });
      const synced = await syncIssuesToProject(ref, projectId);
      return NextResponse.json({ ok: true, synced });
    }

    if (action === "create-issue") {
      const number = await createIssue(ref, {
        title: body.title,
        body: body.body,
        stage: body.stage,
        agentId: body.agentId ?? null,
        milestoneNumber: body.milestoneNumber ?? null,
        startDate: body.startDate ?? null,
        dueDate: body.dueDate ?? null,
        relations: Array.isArray(body.relations) ? body.relations as { type: RelationType; number: number }[] : [],
      });
      return NextResponse.json({ ok: true, number }, { status: 201 });
    }

    if (action === "move-card") {
      await moveCard(ref, Number(body.number), String(body.toStage), Boolean(body.isDone));
      return NextResponse.json({ ok: true });
    }

    if (action === "clone-issue") {
      const number = await cloneIssue(ref, Number(body.number));
      return NextResponse.json({ ok: true, number }, { status: 201 });
    }

    return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
