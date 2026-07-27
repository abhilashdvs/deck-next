import { eq, and } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { linkedSources, workItems } from "@/lib/schema";
import { getItem, createItem, updateItem } from "./items";
import { addSource, updateSource } from "./sources";
import { computeStatus } from "./status";
import { logActivity } from "./activity";
import { nowIso, type ImportRecord } from "@/lib/types";

export function importSources(
  db: DrizzleDb,
  records: ImportRecord[],
): { created: number; updated: number } {
  let created = 0;
  let updated = 0;

  db.transaction((txRaw) => {
    const tx = txRaw as unknown as DrizzleDb;
    for (const rec of records) {
      const existing = tx
        .select()
        .from(linkedSources)
        .where(and(eq(linkedSources.kind, rec.kind), eq(linkedSources.externalId, rec.externalId)))
        .get();

      let itemId: number;
      const sourceFields = {
        repo: rec.repo,
        number: rec.number,
        url: rec.url,
        title: rec.title,
        state: rec.state,
        role: rec.role,
        targetBranch: rec.targetBranch,
        stackedOn: rec.stackedOn,
        mergeOrder: rec.mergeOrder,
        mergeable: rec.mergeable,
        commentsCount: rec.commentsCount,
        unresolvedThreads: rec.unresolvedThreads,
        meta: rec.meta,
        lastSyncedAt: nowIso(),
      };

      if (existing) {
        itemId = existing.itemId;
        updateSource(tx, existing.id, sourceFields);
        updated++;
        const label = `${rec.repo ?? rec.externalId}${rec.number ? ` #${rec.number}` : ""}`;
        if ((existing.state ?? "").toLowerCase() !== "merged" && (rec.state ?? "").toLowerCase() === "merged") {
          logActivity(tx, itemId, "pr_merged", `Merged ${label}`);
        }
        // A merged/closed PR's mergeable value is moot — GitHub often reports
        // stale data post-merge — so it should never trigger a fresh conflict
        // notification.
        const isLive = (rec.state ?? "").toLowerCase() !== "merged" && (rec.state ?? "").toLowerCase() !== "closed";
        if (isLive && existing.mergeable !== "conflicting" && rec.mergeable === "conflicting") {
          logActivity(tx, itemId, "pr_conflict", `Conflicts on ${label}`);
        }
      } else {
        const found = rec.item
          ? tx.select({ id: workItems.id }).from(workItems).where(eq(workItems.title, rec.item.title)).get()
          : null;
        if (found) {
          itemId = found.id;
        } else {
          const wi = createItem(tx, {
            title: rec.item?.title ?? rec.title ?? rec.externalId,
            type: rec.item?.type,
            priority: rec.item?.priority ?? null,
          });
          itemId = wi.id;
        }
        addSource(tx, itemId, { kind: rec.kind, externalId: rec.externalId, ...sourceFields });
        created++;
      }

      const detail = getItem(tx, itemId)!;
      if (detail.statusLocked === 0) {
        const next = computeStatus(detail, detail.sources, detail.checklist);
        if (next !== detail.status) updateItem(tx, itemId, { status: next, lockStatus: false });
      }
    }
  });

  return { created, updated };
}
