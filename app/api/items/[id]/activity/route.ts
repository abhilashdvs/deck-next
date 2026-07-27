import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { listActivity } from "@/lib/model/activity";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return NextResponse.json(listActivity(db(), Number(id)));
}
