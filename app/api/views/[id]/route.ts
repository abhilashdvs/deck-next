import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { deleteView } from "@/lib/model/views";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  deleteView(db(), Number(id));
  return new NextResponse(null, { status: 204 });
}
