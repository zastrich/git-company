// app/api/sync/[companySlug]/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/db/client";
import { syncCompany, SyncDirection } from "../../../../lib/sync/org-sync";

export async function POST(
  request: Request,
  props: { params: Promise<{ companySlug: string }> }
) {
  try {
    const params = await props.params;
    const body = await request.json().catch(() => ({}));
    const direction: SyncDirection = body.direction === "pull" ? "pull" : "push";

    const company = await prisma.company.findUnique({
      where: { slug: params.companySlug },
    });

    if (!company) {
      return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    }

    const result = await syncCompany(company.id, direction);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
