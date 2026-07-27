import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { addSource } from "@/lib/model/sources";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(addSource(db(), Number(id), await req.json()), { status: 201 });
}
