"use client";

import { useEffect, useRef, useState } from "react";
import { Bell, Star, Plus, X } from "lucide-react";
import { useViews } from "@/hooks/use-views";
import { useItems } from "@/hooks/use-items";
import type { ItemFilters, ItemType, Priority } from "@/lib/types";

const TYPES: ItemType[] = ["feature", "bug", "oncall", "task", "chore"];
const PRIORITIES: Priority[] = ["p0", "p1", "p2", "p3"];

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-[11.5px] capitalize transition ${
        active
          ? "border-primary bg-accent-tint text-primary"
          : "border-hairline text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">{label}</div>
  );
}

export function FilterBar({
  filters,
  setFilters,
}: {
  filters: ItemFilters;
  setFilters: (f: ItemFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { views, create, remove } = useViews();
  const { items } = useItems({});
  const allTags = Array.from(new Set(items.flatMap((i) => i.tags))).sort();

  const activeCount = [filters.type, filters.priority, filters.tag, filters.needsAttention].filter(
    Boolean,
  ).length;
  const hasAny = activeCount > 0 || !!filters.q;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = <K extends "type" | "priority" | "tag">(key: K, val: ItemFilters[K]) =>
    setFilters({ ...filters, [key]: filters[key] === val ? undefined : val });

  async function saveView() {
    const n = name.trim();
    if (!n) return;
    await create(n, filters);
    setName("");
    setSaving(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        aria-label="Filter"
        title="Filter"
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 items-center gap-1 rounded-md px-2 font-mono text-[12.5px] transition hover:bg-card ${
          activeCount ? "text-primary" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <span className="text-text-faint">[</span>
        filter{activeCount ? `:${activeCount}` : ""}
        <span className="text-text-faint">]</span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-border bg-popover p-3.5 shadow-lg">
          <Section label="Views" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilters({ ...filters, needsAttention: filters.needsAttention ? undefined : true })}
              className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-[11.5px] transition ${
                filters.needsAttention
                  ? "border-st-review bg-st-review/15 text-st-review"
                  : "border-hairline text-muted-foreground hover:text-foreground"
              }`}
            >
              <Bell className="size-3" />
              Needs attention
            </button>
            {views.map((v) => (
              <span
                key={v.id}
                className="group inline-flex items-center gap-1 rounded-md border border-hairline pl-2.5 pr-1 text-[11.5px] text-muted-foreground transition hover:text-foreground"
              >
                <button onClick={() => setFilters(v.filter)} className="py-1">
                  <Star className="mr-1 inline size-3 text-text-faint" />
                  {v.name}
                </button>
                <button
                  onClick={() => remove(v.id)}
                  aria-label={`Delete view ${v.name}`}
                  className="rounded p-0.5 text-text-faint opacity-0 transition hover:text-st-blocked group-hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
          {saving ? (
            <div className="mb-3 flex gap-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveView();
                  if (e.key === "Escape") setSaving(false);
                }}
                placeholder="View name…"
                className="h-7 flex-1 rounded-md border border-hairline bg-card px-2 text-[12px] text-foreground outline-none focus:border-primary"
              />
              <button
                onClick={saveView}
                className="rounded-md bg-primary px-2 text-[11.5px] font-medium text-primary-foreground"
              >
                Save
              </button>
            </div>
          ) : (
            hasAny && (
              <button
                onClick={() => setSaving(true)}
                className="mb-3 inline-flex items-center gap-1 text-[11.5px] text-text-faint transition hover:text-primary"
              >
                <Plus className="size-3" />
                Save current as view
              </button>
            )
          )}

          {allTags.length > 0 && (
            <>
              <Section label="Tags" />
              <div className="mb-3 flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <Chip key={t} label={`#${t}`} active={filters.tag === t} onClick={() => toggle("tag", t)} />
                ))}
              </div>
            </>
          )}

          <Section label="Type" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <Chip key={t} label={t} active={filters.type === t} onClick={() => toggle("type", t)} />
            ))}
          </div>
          <Section label="Priority" />
          <div className="mb-1 flex flex-wrap gap-1.5">
            {PRIORITIES.map((p) => (
              <Chip
                key={p}
                label={p.toUpperCase()}
                active={filters.priority === p}
                onClick={() => toggle("priority", p)}
              />
            ))}
          </div>
          {hasAny && (
            <button
              className="mt-2 text-[11.5px] text-text-faint transition hover:text-muted-foreground"
              onClick={() => setFilters({})}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
