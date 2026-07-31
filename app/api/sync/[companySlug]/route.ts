// app/api/sync/[companySlug]/route.ts
// API para sincronização bidirecional do orgChart/business.json.
// POST { direction: "push" | "pull" }

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { syncCompany, SyncDirection } from "../../../../lib/sync/org-sync";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ companySlug: string }> }
) {
  const { companySlug } = await params;
  const body = await req.json();
  const direction = body?.direction as SyncDirection | undefined;

  if (!direction || !["push", "pull"].includes(direction)) {
    return NextResponse.json(
      { error: 'Campo "direction" deve ser "push" ou "pull".' },
      { status: 400 }
    );
  }

  const company = await prisma.company.findUnique({ where: { slug: companySlug } });
  if (!company) {
    return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
  }

  try {
    const result = await syncCompany(company.id, direction);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json(
      { error: "Erro na sincronização.", details: error.message },
      { status: 500 }
    );
  }
}
