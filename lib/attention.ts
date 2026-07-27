import type { ItemDetail } from "@/lib/types";
import { anyChecksFailing } from "@/lib/pr";

const DAY = 86_400_000;

// Computed "needs attention" heuristic — no scheduler. A task needs attention
// when a PR is conflicting, a required check is failing, it's been blocked over
// a week, or awaiting review for 3+ days. Snoozed items (snoozed_until in the
// future) are always quiet.
export function attentionReason(item: ItemDetail, nowMs: number): string | null {
  if (item.snoozedUntil && Date.parse(item.snoozedUntil) > nowMs) return null;
  if (item.status === "done") return null;
  if (item.sources?.some((s) => s.mergeable === "conflicting")) return "PR has conflicts";
  if (anyChecksFailing(item.sources ?? [])) return "Required checks failing";
  const age = nowMs - Date.parse(item.updatedAt);
  if (item.status === "blocked" && age > 7 * DAY) return "Blocked over a week";
  if (item.status === "in_review" && age > 3 * DAY) return "Awaiting review 3+ days";
  return null;
}
