import { eq, sql } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { checklistItems } from "@/lib/schema";
import { logActivity } from "./activity";
import type { ChecklistItem } from "@/lib/types";

export function addChecklist(
  db: DrizzleDb,
  itemId: number,
  text: string,
  subtext: string | null = null,
): ChecklistItem {
  const m = db
    .select({ m: sql<number>`COALESCE(MAX(${checklistItems.position}), 0)` })
    .from(checklistItems)
    .where(eq(checklistItems.itemId, itemId))
    .get();
  const position = Number(m?.m ?? 0) + 1;
  return db
    .insert(checklistItems)
    .values({ itemId, text, subtext, done: 0, position })
    .returning()
    .get() as ChecklistItem;
}

export function setChecklistDone(db: DrizzleDb, id: number, done: boolean): ChecklistItem {
  db.update(checklistItems).set({ done: done ? 1 : 0 }).where(eq(checklistItems.id, id)).run();
  const row = db.select().from(checklistItems).where(eq(checklistItems.id, id)).get() as ChecklistItem;
  logActivity(db, row.itemId, "checklist", `${done ? "Checked" : "Unchecked"}: ${row.text}`);
  return row;
}

export function removeChecklist(db: DrizzleDb, id: number): void {
  db.delete(checklistItems).where(eq(checklistItems.id, id)).run();
}
