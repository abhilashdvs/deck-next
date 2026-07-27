import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { getItem, updateItem, deleteItem } from "@/lib/model/items";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const it = getItem(db(), Number(id));
  return it ? NextResponse.json(it) : NextResponse.json({ error: "not found" }, { status: 404 });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(updateItem(db(), Number(id), await req.json()));
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteItem(db(), Number(id));
  return new NextResponse(null, { status: 204 });
}
