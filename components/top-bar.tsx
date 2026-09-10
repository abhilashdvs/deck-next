"use client";

import { useSWRConfig } from "swr";
import { RefreshCw } from "lucide-react";
import { useItems } from "@/hooks/use-items";
import { useSync } from "@/hooks/use-sync";
import { ThemePicker } from "@/components/theme/theme-picker";
import { FilterBar } from "@/components/filters/filter-bar";
import { NewItemDialog } from "@/components/modals/new-item-dialog";
import { Button } from "@/components/ui/button";
import type { ItemFilters } from "@/lib/types";
import type { View } from "./app-shell";

export function TopBar({
  filters,
  setFilters,
  view,
  onViewChange,
}: {
  filters: ItemFilters;
  setFilters: (f: ItemFilters) => void;
  view: View;
  onViewChange: (v: View) => void;
}) {
  const { mutate } = useSWRConfig();
  const revalidate = () =>
    mutate((k) => typeof k === "string" && k.startsWith("/api/items"));
  const { syncing, sync } = useSync(revalidate);
  const { items: attention } = useItems({ needsAttention: true });

  return (
    <header className="flex h-[52px] shrink-0 items-center gap-3 border-b border-hairline bg-popover px-4 font-mono">
      {/* live prompt */}
      <div className="flex select-none items-center gap-1.5 text-[13px]">
        <span className="font-medium text-st-done">deck</span>
        <span className="text-text-faint">›</span>
        <span
          aria-hidden="true"
          className="inline-block h-[14px] w-[7px] animate-[blink_1.1s_infinite] rounded-[1px] bg-primary"
        />
      </div>

      {/* search */}
      <div className="relative ml-1">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[13px] text-primary">
          /
        </span>
        <input
          value={filters.q ?? ""}
          onChange={(e) => setFilters({ ...filters, q: e.target.value || undefined })}
          placeholder="search work…"
          className="h-8 w-[260px] rounded-md border border-hairline bg-card pl-6 pr-3 text-[12.5px] text-foreground outline-none transition-all duration-200 placeholder:text-text-faint focus:w-[300px] focus:border-primary/60 focus:shadow-[0_0_0_3px_var(--accent-tint)]"
        />
      </div>

      {/* view switch */}
      <nav className="ml-2 flex items-center gap-0.5 text-[12.5px]">
        {(["board", "prs"] as const).map((v) => (
          <button
            key={v}
            onClick={() => onViewChange(v)}
            className={`rounded-md px-2.5 py-1 capitalize transition ${
              view === v ? "bg-accent-tint text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {v === "prs" ? "PRs" : "Board"}
          </button>
        ))}
      </nav>

      <div className="flex-1" />

      {/* needs-attention smart view */}
      {attention.length > 0 && (
        <button
          onClick={() =>
            setFilters({ ...filters, needsAttention: filters.needsAttention ? undefined : true })
          }
          title="Needs attention"
          className={`flex h-8 items-center gap-0.5 rounded-md px-2 font-mono text-[12.5px] transition ${
            filters.needsAttention ? "bg-st-review/15 text-st-review" : "text-st-review hover:bg-card"
          }`}
        >
          <span className="text-text-faint">[</span>!{attention.length}
          <span className="text-text-faint">]</span>
        </button>
      )}

      {/* status */}
      <div className="hidden items-center gap-1.5 text-[11px] text-text-faint md:flex">
        <span
          className="size-1.5 rounded-full"
          style={{ background: syncing ? "var(--st-review)" : "var(--st-done)" }}
        />
        {syncing ? "syncing…" : "synced"}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-text-faint hover:text-foreground"
        onClick={sync}
        aria-label="Sync from GitHub"
        title="Sync PR states from GitHub"
      >
        <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
      </Button>
      <FilterBar filters={filters} setFilters={setFilters} />
      <NewItemDialog onCreated={revalidate} />
      <ThemePicker />
    </header>
  );
}
