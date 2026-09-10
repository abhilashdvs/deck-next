import type { MyPr } from "@/lib/model/my-prs";

export type PrBucket = "action" | "waiting" | "ready";

export interface BucketedPrs {
  action: MyPr[];
  waiting: MyPr[];
  ready: MyPr[];
}

export const BUCKET_LABELS: Record<PrBucket, string> = {
  action: "Action needed",
  waiting: "Waiting on CI or review",
  ready: "Ready to merge",
};

export function prBucket(pr: MyPr): PrBucket {
  if (pr.mergeable === "conflicting") return "action";
  if (pr.checks && pr.checks.failing > 0) return "action";
  if ((pr.unresolvedThreads ?? 0) > 0) return "action";
  const review = (pr.reviewDecision ?? "").toLowerCase();
  if (review.includes("chang")) return "action";
  if (review.includes("approv") && (!pr.checks || pr.checks.failing === 0) && pr.mergeable !== "conflicting") {
    return "ready";
  }
  return "waiting";
}

export function bucketizeMyPrs(prs: MyPr[]): BucketedPrs {
  const out: BucketedPrs = { action: [], waiting: [], ready: [] };
  for (const pr of prs) out[prBucket(pr)].push(pr);
  return out;
}

export function failingCount(prs: MyPr[]): number {
  return prs.filter((p) => p.checks && p.checks.failing > 0).length;
}

export function conflictsCount(prs: MyPr[]): number {
  return prs.filter((p) => p.mergeable === "conflicting").length;
}

export function needsReviewCount(prs: MyPr[]): number {
  return prs.filter((p) => p.role === "reviewer" || (p.unresolvedThreads ?? 0) > 0).length;
}

export function repoCounts(prs: MyPr[]): { repo: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of prs) m.set(p.repo, (m.get(p.repo) ?? 0) + 1);
  return Array.from(m.entries())
    .map(([repo, count]) => ({ repo, count }))
    .sort((a, b) => b.count - a.count || a.repo.localeCompare(b.repo));
}
