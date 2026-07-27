import type { WorkItem, LinkedSource, ChecklistItem, Status } from "@/lib/types";
import { prChecks } from "@/lib/pr";

function prStatusFromState(state?: string | null): Status {
  const s = (state ?? "").toLowerCase();
  if (s === "merged" || s === "closed") return "done";
  if (s === "draft") return "in_progress";
  return "in_review";
}

function devrevStatus(state?: string | null): Status | null {
  const s = (state ?? "").toLowerCase();
  if (["backlog", "triage", "prioritized"].includes(s)) return "todo";
  if (["in_development", "work_in_progress", "wip"].includes(s)) return "in_progress";
  if (s === "in_review") return "in_review";
  if (["completed", "resolved", "closed", "done"].includes(s)) return "done";
  return null;
}

function prInReview(src: LinkedSource): boolean {
  const meta = (src.meta ?? {}) as Record<string, unknown>;
  const review = String(meta.review ?? "").toLowerCase();
  const checks = prChecks(src);
  // Pending checks don't disqualify: a PR waiting on CI is still in review.
  const checksOk = !checks || checks.failing === 0;
  return checksOk && review !== "changes_requested";
}

export function computeStatus(
  item: WorkItem,
  sources: LinkedSource[],
  checklist: ChecklistItem[],
): Status {
  if (item.status === "blocked") return "blocked";
  const prs = sources.filter((s) => s.kind === "github_pr");
  if (prs.length >= 2) {
    const open = prs.filter((s) => !["merged", "closed"].includes((s.state ?? "").toLowerCase()));
    const checklistDone = checklist.every((c) => c.done === 1);
    if (open.length === 0 && checklistDone) return "done";
    const allOpenInReview = open.every(
      (s) => (s.state ?? "open").toLowerCase() !== "draft" && prInReview(s),
    );
    return allOpenInReview ? "in_review" : "in_progress";
  }
  const single = sources[0];
  if (!single) return item.status;
  if (single.kind === "github_pr") return prStatusFromState(single.state);
  if (single.kind === "devrev_issue" || single.kind === "devrev_ticket")
    return devrevStatus(single.state) ?? item.status;
  return item.status;
}
