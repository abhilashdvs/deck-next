import { NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { syncMyPrs } from "@/lib/sync-my-prs";

export async function POST() {
  try {
    return NextResponse.json(await syncMyPrs(db()));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
