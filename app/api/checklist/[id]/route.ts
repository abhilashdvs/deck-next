import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { setChecklistDone, removeChecklist } from "@/lib/model/checklist";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json();
  return NextResponse.json(setChecklistDone(db(), Number(id), !!b.done));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  removeChecklist(db(), Number(id));
  return new NextResponse(null, { status: 204 });
}
