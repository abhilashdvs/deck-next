import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { importSources } from "@/lib/model/import";

export async function POST(req: NextRequest) {
  return NextResponse.json(importSources(db(), await req.json()));
}
