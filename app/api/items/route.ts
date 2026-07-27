import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/api-db";
import { listItems, createItem } from "@/lib/model/items";
import type { ItemFilters } from "@/lib/types";

export async function GET(req: NextRequest) {
  const q = Object.fromEntries(req.nextUrl.searchParams) as ItemFilters;
  return NextResponse.json(listItems(db(), q));
}

export async function POST(req: NextRequest) {
  return NextResponse.json(createItem(db(), await req.json()), { status: 201 });
}
