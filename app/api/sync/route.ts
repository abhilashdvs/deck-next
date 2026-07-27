import { NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { syncGithub } from "@/lib/sync";

export async function POST() {
  return NextResponse.json(await syncGithub(db()));
}
