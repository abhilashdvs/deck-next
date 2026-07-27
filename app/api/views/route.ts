import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { listViews, createView } from "@/lib/model/views";

export async function GET() {
  return NextResponse.json(listViews(db()));
}

export async function POST(req: NextRequest) {
  const { name, filter } = await req.json();
  return NextResponse.json(createView(db(), name, filter ?? {}), { status: 201 });
}
