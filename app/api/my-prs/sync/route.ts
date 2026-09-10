import { NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { syncMyPrs } from "@/lib/sync-my-prs";
import { resolveClient } from "@/lib/github-client";

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  try {
    return NextResponse.json(await syncMyPrs(db(), resolveClient(token)));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
