"use client";

import { useState } from "react";
import { RotateCw, Check } from "lucide-react";
import type { MyPr } from "@/lib/model/my-prs";
import { useMyPrs } from "@/hooks/use-my-prs";
import { relativeTime } from "@/lib/relative-time";
import {
  bucketizeMyPrs,
  failingCount,
  conflictsCount,
  needsReviewCount,
  repoCounts,
  BUCKET_LABELS,
  type PrBucket,
} from "@/lib/my-prs";

type HealthFilter = "all" | "failing" | "conflicts" | "review";
type RoleFilter = "all" | "author" | "reviewer";

function healthMatches(pr: MyPr, f: HealthFilter): boolean {
  if (f === "failing") return (pr.checks?.failing ?? 0) > 0;
  if (f === "conflicts") return pr.mergeable === "conflicting";
  if (f === "review") return pr.role === "reviewer" || (pr.unresolvedThreads ?? 0) > 0;
  return true;
}

function pip(pr: MyPr): string {
  if (pr.state === "draft") return "var(--text-faint)";
  return "var(--st-progress)";
}

function metaItems(pr: MyPr): { text: string; cls: "crit" | "rev" | "done" | "muted" }[] {
  const items: { text: string; cls: "crit" | "rev" | "done" | "muted" }[] = [];
  const review = (pr.reviewDecision ?? "").toLowerCase();
  if (pr.mergeable === "conflicting") items.push({ text: "conflicts", cls: "crit" });
  if (pr.checks) {
    if (pr.checks.failing > 0) items.push({ text: `${pr.checks.failing} failing`, cls: "crit" });
    else if (pr.checks.pending > 0) items.push({ text: `${pr.checks.pending} pending`, cls: "rev" });
    else if (pr.checks.required > 0) items.push({ text: "checks passing", cls: "muted" });
  }
  if (review.includes("chang")) items.push({ text: "changes requested", cls: "crit" });
  else if (review.includes("approv")) items.push({ text: "✓ approved", cls: "done" });
  else if (review.includes("requir")) items.push({ text: "review", cls: "muted" });
  if ((pr.unresolvedThreads ?? 0) > 0) items.push({ text: `${pr.unresolvedThreads} unresolved`, cls: "rev" });
  if (pr.state === "draft") items.push({ text: "draft", cls: "muted" });
  if (items.length === 0) items.push({ text: pr.role === "reviewer" ? "reviewing" : "open", cls: "muted" });
  return items;
}

const META_CLS = {
  crit: "text-st-blocked",
  rev: "text-st-review",
  done: "text-st-done",
  muted: "text-text-faint",
} as const;

function RailOpt({
  active,
  onClick,
  dot,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px] transition ${
        active ? "bg-accent-tint text-primary" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {dot && <span className="size-[5px] shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className={`shrink-0 text-[10px] ${active ? "text-primary" : "text-text-faint"}`}>{count}</span>
    </button>
  );
}

export function MyPrsView({ syncing, onSync }: { syncing: boolean; onSync: () => Promise<void> | void }) {
  const { prs, isLoading } = useMyPrs();
  const [health, setHealth] = useState<HealthFilter>("all");
  const [repo, setRepo] = useState<string | null>(null);
  const [role, setRole] = useState<RoleFilter>("all");

  const filtered = prs.filter(
    (p) => healthMatches(p, health) && (!repo || p.repo === repo) && (role === "all" || p.role === role),
  );
  const buckets = bucketizeMyPrs(filtered);
  const repos = repoCounts(prs);
  const authored = prs.filter((p) => p.role === "author").length;
  const reviewing = prs.length - authored;

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside className="flex w-[168px] shrink-0 flex-col overflow-y-auto border-r border-hairline px-2.5 py-3.5">
        <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          Filter
        </div>
        <RailOpt active={health === "all"} onClick={() => setHealth("all")} label="All open" count={prs.length} />
        <RailOpt
          active={health === "failing"}
          onClick={() => setHealth(health === "failing" ? "all" : "failing")}
          dot="var(--st-blocked)"
          label="Failing"
          count={failingCount(prs)}
        />
        <RailOpt
          active={health === "conflicts"}
          onClick={() => setHealth(health === "conflicts" ? "all" : "conflicts")}
          dot="var(--st-blocked)"
          label="Conflicts"
          count={conflictsCount(prs)}
        />
        <RailOpt
          active={health === "review"}
          onClick={() => setHealth(health === "review" ? "all" : "review")}
          dot="var(--st-review)"
          label="Needs review"
          count={needsReviewCount(prs)}
        />

        {repos.length > 0 && (
          <>
            <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
              Repo
            </div>
            {/* Capped + independently scrollable so a long repo list never pushes
                Role off the bottom of the rail on short viewports. */}
            <div className="max-h-56 overflow-y-auto">
              {repos.map((r) => (
                <RailOpt
                  key={r.repo}
                  active={repo === r.repo}
                  onClick={() => setRepo(repo === r.repo ? null : r.repo)}
                  label={r.repo}
                  count={r.count}
                />
              ))}
            </div>
          </>
        )}

        <div className="px-2 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          Role
        </div>
        <RailOpt active={role === "all"} onClick={() => setRole("all")} label="All" count={prs.length} />
        <RailOpt
          active={role === "author"}
          onClick={() => setRole(role === "author" ? "all" : "author")}
          label="Authored"
          count={authored}
        />
        <RailOpt
          active={role === "reviewer"}
          onClick={() => setRole(role === "reviewer" ? "all" : "reviewer")}
          label="Reviewing"
          count={reviewing}
        />
      </aside>

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-3.5">
        <div className="mb-2 flex items-baseline gap-2">
          <span className="text-[13px] font-semibold">All open PRs</span>
          <span className="text-[11px] text-text-faint">sorted by what needs you first</span>
          <span className="ml-auto flex items-center gap-2 text-[11px] text-text-faint">
            <button
              onClick={() => onSync()}
              disabled={syncing}
              className="flex items-center gap-1 rounded-md border border-hairline px-2 py-0.5 transition hover:text-foreground disabled:opacity-50"
            >
              <RotateCw className={`size-3 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "syncing…" : "sync"}
            </button>
          </span>
        </div>

        {isLoading && prs.length === 0 && (
          <div className="py-10 text-center text-[12px] text-text-faint">loading…</div>
        )}
        {!isLoading && prs.length === 0 && (
          <div className="py-10 text-center text-[12px] text-text-faint">
            No PRs yet. Hit sync to pull your open PRs from GitHub.
          </div>
        )}
        {!isLoading && prs.length > 0 && filtered.length === 0 && (
          <div className="py-10 text-center text-[12px] text-text-faint">Nothing matches these filters.</div>
        )}

        {(Object.keys(buckets) as PrBucket[]).map((b) => {
          const list = buckets[b];
          if (list.length === 0) return null;
          return (
            <div key={b}>
              <div className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                {BUCKET_LABELS[b]}
              </div>
              {list.map((pr) => {
                const items = metaItems(pr);
                const ready = b === "ready";
                return (
                  <a
                    key={pr.externalId}
                    href={pr.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition hover:border-hairline hover:bg-card"
                  >
                    <span className="size-[5px] shrink-0 rounded-full" style={{ background: ready ? "var(--st-done)" : pip(pr) }} />
                    <span className="mono w-[118px] shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                      {pr.repo} #{pr.number}
                    </span>
                    <span className="min-w-0 truncate text-[12.5px] text-foreground">{pr.title}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-2 text-[10.5px]">
                      {ready && <Check className="size-3 text-st-done" />}
                      {items.map((it, i) => (
                        <span key={i} className="flex items-center gap-2">
                          {i > 0 && <span className="text-text-faint">·</span>}
                          <span className={META_CLS[it.cls]}>{it.text}</span>
                        </span>
                      ))}
                      <span className="w-8 text-right text-text-faint">{relativeTime(pr.updatedAt)}</span>
                    </span>
                  </a>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
