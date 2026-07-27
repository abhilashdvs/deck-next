import { eq, desc } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { activity } from "@/lib/schema";
import { nowIso, type Activity, type ActivityType } from "@/lib/types";

export function logActivity(
  db: DrizzleDb,
  itemId: number,
  type: ActivityType,
  summary: string,
  data?: Record<string, unknown>,
): void {
  db.insert(activity)
    .values({ itemId, type, summary, data: data ? JSON.stringify(data) : null, createdAt: nowIso() })
    .run();
}

export function listActivity(db: DrizzleDb, itemId: number, limit = 40): Activity[] {
  return db
    .select()
    .from(activity)
    .where(eq(activity.itemId, itemId))
    .orderBy(desc(activity.id))
    .limit(limit)
    .all()
    .map((r) => ({ ...r, data: r.data ? JSON.parse(r.data) : null })) as Activity[];
}
