import { NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { syncGithub } from "@/lib/sync";
import { resolveClient } from "@/lib/github-client";

export async function POST(req?: Request) {
  // PAT arrives as `Authorization: Bearer <pat>` from the client; absent header
  // (or absent request, as in tests) falls back to the local gh CLI.
  const token = req?.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  return NextResponse.json(await syncGithub(db(), resolveClient(token)));
}
