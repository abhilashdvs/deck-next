import { eq, and, isNotNull } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { linkedSources, workItems } from "@/lib/schema";
import { hydrateSource } from "./items";
import { logActivity } from "./activity";
import { nowIso, type LinkedSource, type SourceKind } from "@/lib/types";

type SourceInput = Partial<LinkedSource> & { kind: SourceKind };

export function addSource(db: DrizzleDb, itemId: number, s: SourceInput): LinkedSource {
  // A PR can only be linked once (UNIQUE(kind, external_id)). If it already
  // exists, re-link it to this item and refresh its structural fields instead
  // of blowing up on the unique constraint.
  if (s.externalId) {
    const existing = db
      .select()
      .from(linkedSources)
      .where(and(eq(linkedSources.kind, s.kind), eq(linkedSources.externalId, s.externalId)))
      .get();
    if (existing) {
      const merged = updateSource(db, existing.id, {
        repo: s.repo ?? existing.repo,
        number: s.number ?? existing.number,
        url: s.url ?? existing.url,
        title: s.title ?? existing.title,
        role: (s.role ?? existing.role) as LinkedSource["role"],
        targetBranch: s.targetBranch ?? existing.targetBranch,
        mergeOrder: s.mergeOrder ?? existing.mergeOrder,
      });
      if (existing.itemId !== itemId) {
        db.update(linkedSources).set({ itemId }).where(eq(linkedSources.id, existing.id)).run();
        db.update(workItems).set({ updatedAt: nowIso() }).where(eq(workItems.id, itemId)).run();
      }
      return merged;
    }
  }
  const row = db
    .insert(linkedSources)
    .values({
      itemId,
      kind: s.kind,
      externalId: s.externalId ?? null,
      repo: s.repo ?? null,
      number: s.number ?? null,
      url: s.url ?? null,
      title: s.title ?? null,
      state: s.state ?? null,
      role: s.role ?? null,
      targetBranch: s.targetBranch ?? null,
      stackedOn: s.stackedOn ?? null,
      mergeOrder: s.mergeOrder ?? null,
      mergeable: s.mergeable ?? null,
      commentsCount: s.commentsCount ?? null,
      unresolvedThreads: s.unresolvedThreads ?? null,
      meta: s.meta ? JSON.stringify(s.meta) : null,
      lastSyncedAt: s.lastSyncedAt ?? null,
    })
    .returning()
    .get();
  db.update(workItems).set({ updatedAt: nowIso() }).where(eq(workItems.id, itemId)).run();
  const label =
    s.repo && s.number ? `${s.repo} #${s.number}` : s.kind === "slack" ? "Slack thread" : s.kind;
  logActivity(db, itemId, "source_linked", `Linked ${label}`);
  return hydrateSource(row);
}

// Only writes fields that are explicitly provided (`!== undefined`), so a
// partial update (state-only sync) never wipes role/target/merge_order/title.
// A `null` still clears intentionally.
export function updateSource(
  db: DrizzleDb,
  sourceId: number,
  patch: Partial<Omit<LinkedSource, "id" | "itemId" | "meta">> & { meta?: Record<string, unknown> | null },
): LinkedSource {
  const set: Record<string, unknown> = {};
  const direct: Record<string, unknown> = {
    externalId: patch.externalId,
    repo: patch.repo,
    number: patch.number,
    url: patch.url,
    title: patch.title,
    state: patch.state,
    role: patch.role,
    targetBranch: patch.targetBranch,
    stackedOn: patch.stackedOn,
    mergeOrder: patch.mergeOrder,
    mergeable: patch.mergeable,
    commentsCount: patch.commentsCount,
    unresolvedThreads: patch.unresolvedThreads,
    lastSyncedAt: patch.lastSyncedAt,
  };
  for (const [k, v] of Object.entries(direct)) {
    if (v !== undefined) set[k] = v;
  }
  if (patch.meta !== undefined) set.meta = patch.meta ? JSON.stringify(patch.meta) : null;
  if (Object.keys(set).length) {
    db.update(linkedSources).set(set).where(eq(linkedSources.id, sourceId)).run();
  }
  const row = db.select().from(linkedSources).where(eq(linkedSources.id, sourceId)).get()!;
  db.update(workItems).set({ updatedAt: nowIso() }).where(eq(workItems.id, row.itemId)).run();
  return hydrateSource(row);
}

export function removeSource(db: DrizzleDb, id: number): void {
  const row = db
    .select({ itemId: linkedSources.itemId })
    .from(linkedSources)
    .where(eq(linkedSources.id, id))
    .get();
  db.delete(linkedSources).where(eq(linkedSources.id, id)).run();
  if (row) db.update(workItems).set({ updatedAt: nowIso() }).where(eq(workItems.id, row.itemId)).run();
}

export function allGithubSources(
  db: DrizzleDb,
): { externalId: string | null; repo: string | null; number: number | null; url: string | null }[] {
  return db
    .select({
      externalId: linkedSources.externalId,
      repo: linkedSources.repo,
      number: linkedSources.number,
      url: linkedSources.url,
    })
    .from(linkedSources)
    .where(and(eq(linkedSources.kind, "github_pr"), isNotNull(linkedSources.externalId)))
    .all();
}
