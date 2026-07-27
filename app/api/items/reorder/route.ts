import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { reorderItems } from "@/lib/model/items";

export async function POST(req: NextRequest) {
  const { ids } = await req.json();
  if (Array.isArray(ids)) reorderItems(db(), ids.map(Number));
  return new NextResponse(null, { status: 204 });
}
