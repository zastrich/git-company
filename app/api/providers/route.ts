// app/api/providers/route.ts
import { NextResponse } from "next/server";
import { prisma } from "../../../lib/db/client";

export async function GET() {
  try {
    const providers = await prisma.aIProvider.findMany({
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { agents: true } } },
    });
    return NextResponse.json(providers);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, slug, type, baseUrl, isLocal } = body;

    if (!name || !slug || !type) {
      return NextResponse.json(
        { error: "Campos name, slug e type são obrigatórios." },
        { status: 400 }
      );
    }

    const provider = await prisma.aIProvider.upsert({
      where: { slug },
      update: { name, type, baseUrl: baseUrl || null, isLocal: Boolean(isLocal) },
      create: { name, slug, type, baseUrl: baseUrl || null, isLocal: Boolean(isLocal) },
    });

    return NextResponse.json(provider, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
