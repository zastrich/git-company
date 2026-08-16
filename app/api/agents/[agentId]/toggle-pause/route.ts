// app/api/agents/[agentId]/toggle-pause/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/db/client";
import { createAuditLog } from "../../../../../lib/db/audit";

export async function POST(
  request: Request,
  props: { params: Promise<{ agentId: string }> }
) {
  try {
    const params = await props.params;
    const body = await request.json().catch(() => ({}));
    const { companySlug } = body;

    let agent = null;
    if (companySlug) {
      const company = await prisma.company.findUnique({ where: { slug: companySlug } });
      if (company) {
        agent = await prisma.agentConfig.findUnique({
          where: { companyId_agentId: { companyId: company.id, agentId: params.agentId } },
        });
      }
    }

    if (!agent) {
      agent = await prisma.agentConfig.findFirst({
        where: { id: params.agentId },
      });
    }

    if (!agent) {
      return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
    }

    const updated = await prisma.agentConfig.update({
      where: { id: agent.id },
      data: { isPaused: !agent.isPaused },
    });

    await createAuditLog({
      companyId: agent.companyId,
      agentId: agent.agentId,
      agentName: agent.role,
      action: updated.isPaused ? "AGENT_PAUSED" : "AGENT_RESUMED",
      details: { isPaused: updated.isPaused },
    });

    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
