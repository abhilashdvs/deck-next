"use client";

import type { ItemDetail, LinkedSource } from "@/lib/types";
import {
  prProgress,
  sourceUrl,
  hasConflict,
  unresolvedCount,
  linkLabel,
  isMergedState,
  checksFailingCount,
} from "@/lib/pr";
import { relativeTime } from "@/lib/relative-time";
import { MessageSquare, TriangleAlert, ArrowRight, Lock, Link2, CircleX } from "lucide-react";
import type { ReactNode } from "react";

const PRIO_CLASS: Record<string, string> = {
  p0: "text-st-blocked bg-st-blocked/15",
  p1: "text-st-review bg-st-review/15",
  p2: "text-st-progress bg-st-progress/15",
  p3: "text-st-todo bg-st-todo/15",
};

function Chip({ url, mono, children }: { url?: string; mono?: boolean; children: ReactNode }) {
  const base = `inline-flex max-w-full items-center gap-1.5 rounded-md border border-hairline bg-foreground/[0.03] px-2 py-0.5 text-[10.5px] text-muted-foreground ${mono ? "font-mono" : ""}`;
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`${base} transition hover:border-primary hover:text-primary`}
      >
        {children}
      </a>
    );
  }
  return <span className={base}>{children}</span>;
}

function PrTrack({ prs, label }: { prs: LinkedSource[]; label: string }) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      <div className="flex gap-[3px] rounded-full bg-foreground/[0.06] p-px">
        {prs.map((s, i) => {
          const st = (s.state ?? "").toLowerCase();
          const bg = isMergedState(s.state)
            ? "var(--st-done)"
            : st === "draft"
              ? "var(--text-faint)"
              : "var(--st-progress)";
          return <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: bg }} />;
        })}
      </div>
      <span className="text-[10.5px] text-text-faint">{label}</span>
    </div>
  );
}

function LinkChips({ sources }: { sources: LinkedSource[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s) => (
        <Chip key={s.id} url={sourceUrl(s)}>
          {s.kind === "slack" ? <MessageSquare className="size-3 shrink-0" /> : <Link2 className="size-3 shrink-0" />}
          <span className="min-w-0 truncate">{linkLabel(s)}</span>
        </Chip>
      ))}
    </div>
  );
}

export function Card({ item, onOpen }: { item: ItemDetail; onOpen: (id: number) => void }) {
  const { prs, merged, total, repoCount, hasStacked } = prProgress(item.sources);
  const linkSources = item.sources.filter((s) => s.kind !== "github_pr");
  const conflict = hasConflict(item.sources);
  const unresolved = unresolvedCount(item.sources);
  const failingChecks = checksFailingCount(item.sources);
  const label = `${merged} / ${total} PR${total === 1 ? "" : "s"} merged · ${repoCount} repo${repoCount === 1 ? "" : "s"}${hasStacked ? " · stacked" : ""}`;

  return (
    <div
      onClick={() => onOpen(item.id)}
      className={`cursor-pointer rounded-[10px] border border-hairline bg-card px-3 py-2.5 transition hover:-translate-y-px hover:bg-card-hover ${item.status === "done" ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          {item.type}
        </span>
        <div className="flex items-center gap-1.5">
          {conflict && <TriangleAlert className="size-3 text-st-blocked" aria-label="has conflicts" />}
          {failingChecks > 0 && (
            <CircleX className="size-3 text-st-blocked" aria-label={`${failingChecks} required checks failing`} />
          )}
          {unresolved > 0 && (
            <MessageSquare className="size-3 text-st-review" aria-label={`${unresolved} unresolved`} />
          )}
          {item.priority && (
            <span className={`rounded-md px-1.5 py-px text-[10px] font-semibold ${PRIO_CLASS[item.priority]}`}>
              {item.priority.toUpperCase()}
            </span>
          )}
        </div>
      </div>

      <div className="mt-1.5 break-words text-[13px] font-medium leading-snug text-foreground">{item.title}</div>

      {total >= 1 && <PrTrack prs={prs} label={label} />}
      {total === 1 && (
        <div className="mt-2.5">
          <Chip url={sourceUrl(prs[0])} mono>
            <span className="min-w-0 truncate">
              {prs[0].repo} #{prs[0].number}
            </span>
          </Chip>
        </div>
      )}
      {linkSources.length > 0 && <LinkChips sources={linkSources} />}

      {item.status === "blocked" && item.blockedReason && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-st-blocked">
          <Lock className="size-3" />
          {item.blockedReason}
        </div>
      )}

      {item.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {item.tags.map((t) => (
            <span key={t} className="rounded bg-foreground/[0.04] px-1.5 py-px text-[10px] text-text-faint">
              #{t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {item.nextAction ? (
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <ArrowRight className="size-3 shrink-0 text-primary" />
            <span className="truncate">{item.nextAction}</span>
          </div>
        ) : (
          <span />
        )}
        <span className="shrink-0 text-[10.5px] text-text-faint">{relativeTime(item.updatedAt)}</span>
      </div>
    </div>
  );
}
