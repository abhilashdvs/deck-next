import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { addChecklist } from "@/lib/model/checklist";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const b = await req.json();
  return NextResponse.json(addChecklist(db(), Number(id), b.text, b.subtext ?? null), { status: 201 });
}
