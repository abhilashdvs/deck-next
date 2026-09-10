import { NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { listMyPrs } from "@/lib/model/my-prs";

export async function GET() {
  return NextResponse.json(listMyPrs(db()));
}
