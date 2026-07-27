import { eq, asc } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { savedViews } from "@/lib/schema";
import { nowIso, type SavedView, type ItemFilters } from "@/lib/types";

function hydrate(r: typeof savedViews.$inferSelect): SavedView {
  return { ...r, filter: JSON.parse(r.filter || "{}") } as SavedView;
}

export function listViews(db: DrizzleDb): SavedView[] {
  return db
    .select()
    .from(savedViews)
    .orderBy(asc(savedViews.position), asc(savedViews.id))
    .all()
    .map(hydrate);
}

export function createView(db: DrizzleDb, name: string, filter: ItemFilters): SavedView {
  const row = db
    .insert(savedViews)
    .values({ name, filter: JSON.stringify(filter ?? {}), position: 0, createdAt: nowIso() })
    .returning()
    .get();
  return hydrate(row);
}

export function deleteView(db: DrizzleDb, id: number): void {
  db.delete(savedViews).where(eq(savedViews.id, id)).run();
}
