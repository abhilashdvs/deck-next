import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { updateSource, removeSource } from "@/lib/model/sources";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(updateSource(db(), Number(id), await req.json()));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  removeSource(db(), Number(id));
  return new NextResponse(null, { status: 204 });
}
