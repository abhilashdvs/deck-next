"use client";

import type { LinkedSource, PrChecks } from "@/lib/types";
import { sourceUrl, isMergedState, prChecks } from "@/lib/pr";
import { Check } from "lucide-react";
import { FailingChecks } from "./failing-checks";

// Checks on a merged or closed PR no longer gate anything, so they're hidden.
function liveChecks(src: LinkedSource): PrChecks | null {
  if (isMergedState(src.state)) return null;
  const c = prChecks(src);
  return c && c.required > 0 ? c : null;
}

type MetaCls = "muted" | "crit" | "rev" | "done";
type MetaItem = { text: string; cls: MetaCls; icon?: boolean };

const META_CLS: Record<MetaCls, string> = {
  muted: "text-text-faint",
  crit: "text-st-blocked",
  rev: "text-st-review",
  done: "text-st-done",
};

// One skimmable line instead of a wall of coloured pills. Colour is reserved
// for whichever fact most needs attention; "passing"/"approved" get a small
// checkmark icon instead of coloured text, so a good outcome doesn't compete
// visually with a problem one.
function metaItems(src: LinkedSource): MetaItem[] {
  const items: MetaItem[] = [];
  const state = (src.state ?? "").toLowerCase();

  if (state === "merged") items.push({ text: "merged", cls: "done" });
  else if (state === "closed") items.push({ text: "closed", cls: "muted" });

  if (src.mergeable === "conflicting") items.push({ text: "conflicts", cls: "crit" });

  const checks = liveChecks(src);
  if (checks) {
    if (checks.failing > 0) items.push({ text: `${checks.failing} checks failing`, cls: "crit" });
    else if (checks.pending > 0) items.push({ text: `${checks.pending} checks pending`, cls: "rev" });
    else items.push({ text: "checks passing", cls: "muted", icon: true });
  }

  const meta = (src.meta ?? {}) as Record<string, unknown>;
  const review = String(meta.review ?? "").toLowerCase();
  if (review.includes("chang")) items.push({ text: "changes requested", cls: "crit" });
  else if (review.includes("approv")) items.push({ text: "approved", cls: "muted", icon: true });
  else if (review.includes("requir")) items.push({ text: "review", cls: "muted" });

  if (items.length === 0) items.push({ text: state === "draft" ? "draft" : "open", cls: "muted" });

  if ((src.unresolvedThreads ?? 0) > 0) {
    const isOnlySignal = items.length === 1 && items[0].cls === "muted";
    items.push({ text: `${src.unresolvedThreads} unresolved`, cls: isOnlySignal ? "rev" : "muted" });
  }

  return items;
}

// Same-repo stacked target abbreviates to just the PR number; cross-repo or
// unstacked PRs show the full label. `stackedOn` isn't collected by the add
// PR UI yet, so this falls back to the existing targetBranch string until it
// is — the abbreviation activates automatically once it lands.
function targetLabel(src: LinkedSource): string | null {
  if (src.stackedOn) {
    const [repo, num] = src.stackedOn.split("#");
    return repo === src.repo ? `→ #${num}` : `→ ${src.stackedOn}`;
  }
  return src.targetBranch ? `→ ${src.targetBranch}` : null;
}

export function PrRow({ src }: { src: LinkedSource }) {
  const url = sourceUrl(src);
  const st = (src.state ?? "").toLowerCase();
  const pip = isMergedState(src.state)
    ? "var(--st-done)"
    : st === "draft"
      ? "var(--text-faint)"
      : "var(--st-progress)";
  const idText = src.repo ? `${src.repo}${src.number ? ` #${src.number}` : ""}` : src.externalId || src.kind;
  const items = metaItems(src);
  const failed = liveChecks(src)?.failed ?? [];
  const target = targetLabel(src);

  return (
    <div
      className={`relative flex gap-3 rounded-[10px] border border-hairline bg-card p-2.5 ${url ? "transition hover:bg-card-hover" : ""}`}
    >
      {src.mergeOrder != null && (
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline text-[10.5px] text-muted-foreground">
          {src.mergeOrder}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: pip }} />
          {url ? (
            // Stretched link: the anchor itself stays position:static so its
            // ::after (absolute + inset-0) sizes to the nearest *positioned*
            // ancestor — the card div above, which is `relative` — covering
            // the whole card as an invisible click target. Do not add
            // `relative` to this anchor: that would make ::after size to the
            // anchor's own small text box instead.
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-foreground after:absolute after:inset-0 after:content-['']"
            >
              {idText}
            </a>
          ) : (
            <span className="font-mono text-[12px] text-foreground">{idText}</span>
          )}
          {target && (
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-text-faint" title={target}>
              {target}
            </span>
          )}
        </div>
        {src.title && <div className="mt-1 truncate text-[11.5px] text-muted-foreground">{src.title}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-text-faint" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="flex items-center gap-1">
                {item.icon && <Check className="size-3 text-st-done" aria-hidden="true" />}
                <span className={META_CLS[item.cls]}>{item.text}</span>
              </span>
            </span>
          ))}
        </div>
        <FailingChecks failed={failed} />
      </div>
    </div>
  );
}
