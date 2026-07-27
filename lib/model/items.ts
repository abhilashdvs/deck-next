import { eq, and, like, desc, asc } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { workItems, linkedSources, checklistItems } from "@/lib/schema";
import { logActivity } from "./activity";
import { attentionReason } from "@/lib/attention";
import {
  nowIso,
  STATUS_LABELS,
  type WorkItem,
  type ItemDetail,
  type LinkedSource,
  type ChecklistItem,
  type ItemFilters,
  type CreateItemInput,
  type Status,
} from "@/lib/types";

export function hydrateItem(row: typeof workItems.$inferSelect): WorkItem {
  return {
    ...row,
    statusLocked: row.statusLocked as 0 | 1,
    tags: JSON.parse(row.tags || "[]"),
  } as WorkItem;
}

export function hydrateSource(row: typeof linkedSources.$inferSelect): LinkedSource {
  return { ...row, meta: row.meta ? JSON.parse(row.meta) : null } as LinkedSource;
}

export function createItem(db: DrizzleDb, input: CreateItemInput): WorkItem {
  const t = nowIso();
  const row = db
    .insert(workItems)
    .values({
      title: input.title,
      type: input.type ?? "task",
      status: input.status ?? "todo",
      statusLocked: 0,
      priority: input.priority ?? null,
      nextAction: input.nextAction ?? null,
      notes: input.notes ?? null,
      tags: JSON.stringify(input.tags ?? []),
      position: input.position ?? 0,
      createdAt: t,
      updatedAt: t,
    })
    .returning()
    .get();
  logActivity(db, row.id, "created", `Created as ${row.type}`);
  return hydrateItem(row);
}

export function getItem(db: DrizzleDb, id: number): ItemDetail | null {
  const row = db.select().from(workItems).where(eq(workItems.id, id)).get();
  if (!row) return null;
  const sources = db
    .select()
    .from(linkedSources)
    .where(eq(linkedSources.itemId, id))
    .all()
    .map(hydrateSource)
    .sort((a, b) => (a.mergeOrder ?? Infinity) - (b.mergeOrder ?? Infinity) || a.id - b.id);
  const checklist = (db
    .select()
    .from(checklistItems)
    .where(eq(checklistItems.itemId, id))
    .all() as ChecklistItem[]).sort((a, b) => a.position - b.position || a.id - b.id);
  return { ...hydrateItem(row), sources, checklist };
}

export function listItems(db: DrizzleDb, f: ItemFilters = {}): ItemDetail[] {
  const conds = [];
  if (f.status) conds.push(eq(workItems.status, f.status));
  if (f.type) conds.push(eq(workItems.type, f.type));
  if (f.priority) conds.push(eq(workItems.priority, f.priority));
  if (f.q) conds.push(like(workItems.title, `%${f.q}%`));
  if (f.tag) conds.push(like(workItems.tags, `%"${f.tag}"%`));
  const idRows = db
    .select({ id: workItems.id })
    .from(workItems)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(asc(workItems.position), desc(workItems.updatedAt))
    .all();
  let details = idRows.map((r) => getItem(db, r.id)!);
  if (f.repo) details = details.filter((d) => d.sources.some((s) => s.repo === f.repo));
  if (f.needsAttention) {
    const now = Date.now();
    details = details.filter((d) => attentionReason(d, now) !== null);
  }
  return details;
}

interface ItemPatch {
  title?: string;
  type?: string;
  priority?: string | null;
  nextAction?: string | null;
  notes?: string | null;
  blockedReason?: string | null;
  position?: number;
  snoozedUntil?: string | null;
  tags?: string[];
  status?: Status;
  lockStatus?: boolean;
}

export function updateItem(db: DrizzleDb, id: number, patch: ItemPatch): WorkItem {
  const before =
    patch.status !== undefined || patch.notes !== undefined
      ? db
          .select({ status: workItems.status, notes: workItems.notes })
          .from(workItems)
          .where(eq(workItems.id, id))
          .get()
      : null;
  const set: Record<string, unknown> = { updatedAt: nowIso() };
  const direct = {
    title: patch.title,
    type: patch.type,
    priority: patch.priority,
    nextAction: patch.nextAction,
    notes: patch.notes,
    blockedReason: patch.blockedReason,
    position: patch.position,
    snoozedUntil: patch.snoozedUntil,
  };
  for (const [k, v] of Object.entries(direct)) {
    if (v !== undefined) set[k] = v;
  }
  if (patch.tags !== undefined) set.tags = JSON.stringify(patch.tags);
  if (patch.status !== undefined) {
    set.status = patch.status;
    set.statusLocked = patch.lockStatus === false ? 0 : 1;
  }
  db.update(workItems).set(set).where(eq(workItems.id, id)).run();
  if (patch.status !== undefined && before && before.status !== patch.status) {
    logActivity(db, id, "status", `→ ${STATUS_LABELS[patch.status]}`);
  }
  if (patch.notes !== undefined && before && (before.notes ?? "") !== (patch.notes ?? "")) {
    logActivity(db, id, "note", "Updated notes");
  }
  return hydrateItem(db.select().from(workItems).where(eq(workItems.id, id)).get()!);
}

export function deleteItem(db: DrizzleDb, id: number): void {
  db.delete(workItems).where(eq(workItems.id, id)).run();
}

// Persist a drag-reorder: set position = index for each id, in one transaction.
// Deliberately does NOT touch updated_at — reordering isn't a content edit, and
// bumping it would re-shuffle the board under the updated_at tiebreak.
export function reorderItems(db: DrizzleDb, ids: number[]): void {
  db.transaction((txRaw) => {
    const tx = txRaw as unknown as DrizzleDb;
    ids.forEach((id, idx) => {
      tx.update(workItems).set({ position: idx }).where(eq(workItems.id, id)).run();
    });
  });
}
