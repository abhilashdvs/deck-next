"use client";

import { X } from "lucide-react";
import type { LinkedSource, SourceRole } from "@/lib/types";
import { PrRow } from "./pr-row";

export function PrGroup({
  role,
  label,
  target,
  sources,
  onPatchSource,
  onRemoveSource,
}: {
  role: SourceRole;
  label: string;
  target: string;
  sources: LinkedSource[];
  onPatchSource: (id: number, patch: Record<string, unknown>) => void;
  onRemoveSource: (id: number) => void;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{label}</span>
        <span className="text-[10.5px] text-text-faint">{target}</span>
        <span className="rounded-full bg-card px-1.5 py-px text-[11px] text-text-faint">{sources.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {sources.map((s) => (
          <div key={s.id} className="group/pr relative">
            <PrRow src={s} />
            {/* z-20: must outrank PrRow's own stretched-link overlay (an
                unpositioned z-index, effectively 0) so the role select and
                remove button stay clickable on hover. */}
            <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-md border border-hairline bg-popover px-1 py-0.5 opacity-0 shadow-sm transition group-hover/pr:pointer-events-auto group-hover/pr:opacity-100">
              <select
                aria-label="PR role"
                value={s.role === "stacked" ? "stacked" : s.role === "docs" ? "docs" : "base"}
                onChange={(e) => {
                  const r = e.target.value;
                  onPatchSource(s.id, {
                    role: r,
                    targetBranch: r === "stacked" ? "base PR branch" : "master",
                  });
                }}
                className="h-5 cursor-pointer rounded bg-transparent text-[10px] text-muted-foreground outline-none"
              >
                <option value="base">Base</option>
                <option value="stacked">Stacked</option>
                <option value="docs">Docs</option>
              </select>
              <button
                onClick={() => onRemoveSource(s.id)}
                aria-label="Remove PR"
                className="text-text-faint transition hover:text-st-blocked"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
