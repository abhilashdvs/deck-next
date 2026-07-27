"use client";

import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, ChevronDown, Bell, X } from "lucide-react";
import type { LinkedSource, SourceRole, ItemType, Priority, Status } from "@/lib/types";
import { STATUSES, STATUS_LABELS } from "@/lib/types";
import { STATUS_COLOR, sourceUrl, isMergedState, linkLabel } from "@/lib/pr";
import { attentionReason } from "@/lib/attention";

const TYPES: ItemType[] = ["feature", "bug", "oncall", "task", "chore"];
const PRIOS: Priority[] = ["p0", "p1", "p2", "p3"];
import { relativeTime } from "@/lib/relative-time";
import { useItem } from "@/hooks/use-item";
import { ActivityTimeline } from "./activity-timeline";
import { AddSource } from "./add-source";
import { EditableText } from "./editable-text";
import { ItemFields } from "./item-fields";
import { PrGroup } from "./pr-group";

const ROLE_META: { role: SourceRole; label: string; target: string }[] = [
  { role: "base", label: "Base PRs", target: "→ master" },
  { role: "stacked", label: "Stacked fixes", target: "→ base PR branch" },
  { role: "docs", label: "Docs", target: "→ master" },
];

const PRIO_CLASS: Record<string, string> = {
  p0: "text-st-blocked bg-st-blocked/15",
  p1: "text-st-review bg-st-review/15",
  p2: "text-st-progress bg-st-progress/15",
  p3: "text-st-todo bg-st-todo/15",
};

export function DetailSheet({
  id,
  onClose,
  onChanged,
}: {
  id: number | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { item, mutate } = useItem(id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => setConfirmDelete(false), [id]);

  async function toggleCheck(checkId: number, done: boolean) {
    await fetch(`/api/checklist/${checkId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ done: !done }),
    });
    mutate();
    onChanged();
  }

  async function remove() {
    if (id == null) return;
    await fetch(`/api/items/${id}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  async function patchItem(patch: Record<string, unknown>) {
    if (id == null) return;
    await fetch(`/api/items/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    mutate();
    onChanged();
  }

  async function addSourceToItem(src: Record<string, unknown>) {
    if (id == null) return;
    const body = { ...src };
    if (src.kind === "github_pr") {
      body.mergeOrder = Math.max(0, ...prs.map((p) => p.mergeOrder ?? 0)) + 1;
    }
    await fetch(`/api/items/${id}/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    mutate();
    onChanged();
  }

  async function patchSource(sourceId: number, patch: Record<string, unknown>) {
    await fetch(`/api/sources/${sourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    mutate();
    onChanged();
  }

  async function removeSourceFromItem(sourceId: number) {
    await fetch(`/api/sources/${sourceId}`, { method: "DELETE" });
    mutate();
    onChanged();
  }

  const prs = item?.sources.filter((s) => s.kind === "github_pr") ?? [];
  const links = item?.sources.filter((s) => s.kind !== "github_pr") ?? [];
  const byRole = (role: SourceRole): LinkedSource[] =>
    prs.filter((s) => (s.role === "stacked" ? "stacked" : s.role === "docs" ? "docs" : "base") === role);

  const repoCount = new Set(prs.map((s) => s.repo).filter(Boolean)).size;
  const merged = prs.filter((s) => isMergedState(s.state)).length;
  const meta = item
    ? [
        repoCount ? `${repoCount} repos` : null,
        prs.length ? `${prs.length} PRs` : null,
        prs.length ? `${merged} merged` : null,
        `updated ${relativeTime(item.updatedAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  const reason = item ? attentionReason(item, Date.now()) : null;
  const snoozed = !!(item?.snoozedUntil && Date.parse(item.snoozedUntil) > Date.now());

  return (
    <Sheet open={id != null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[560px] max-w-[94vw] gap-0 overflow-y-auto p-0 sm:max-w-[560px]"
      >
        {item && (
          <div className="p-5">
            <SheetHeader className="p-0">
              <div className="flex items-center gap-1.5">
                {/* Type — editable */}
                <div className="relative">
                  <select
                    aria-label="Type"
                    title="Change type"
                    value={item.type}
                    onChange={(e) => patchItem({ type: e.target.value as ItemType })}
                    className="cursor-pointer appearance-none rounded-md bg-transparent py-0.5 pr-3.5 text-[9.5px] font-semibold uppercase tracking-[0.08em] text-text-faint outline-none transition hover:text-foreground"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-0 top-1/2 size-2.5 -translate-y-1/2 text-text-faint" />
                </div>
                {/* Priority — editable */}
                <select
                  aria-label="Priority"
                  title="Change priority"
                  value={item.priority ?? ""}
                  onChange={(e) => patchItem({ priority: e.target.value || null })}
                  className={`cursor-pointer appearance-none rounded-md px-1.5 py-px text-[10px] font-semibold outline-none transition ${
                    item.priority ? PRIO_CLASS[item.priority] : "bg-card text-text-faint hover:text-muted-foreground"
                  }`}
                >
                  <option value="">— pri</option>
                  {PRIOS.map((p) => (
                    <option key={p} value={p}>
                      {p.toUpperCase()}
                    </option>
                  ))}
                </select>
                {/* Status — editable (locks like a drag) */}
                <div className="relative inline-flex items-center gap-1.5 rounded-full bg-card py-0.5 pl-2 pr-1">
                  <span className="size-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[item.status] }} />
                  <select
                    aria-label="Status"
                    title="Change status"
                    value={item.status}
                    onChange={(e) => patchItem({ status: e.target.value as Status })}
                    className="cursor-pointer appearance-none bg-transparent pr-4 text-[11px] text-muted-foreground outline-none"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 size-2.5 -translate-y-1/2 text-text-faint" />
                </div>
                <div className="ml-auto flex items-center gap-0.5">
                  <button
                    onClick={() => setConfirmDelete(true)}
                    aria-label="Delete task"
                    title="Delete task"
                    className="grid size-8 place-items-center rounded-lg text-text-faint transition hover:bg-card hover:text-st-blocked"
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <button
                    onClick={onClose}
                    aria-label="Close"
                    title="Close"
                    className="grid size-8 place-items-center rounded-lg text-text-faint transition hover:bg-card hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              <SheetTitle className="mt-1">
                <EditableText
                  value={item.title}
                  onCommit={(v) => v && patchItem({ title: v })}
                  displayClassName="w-full break-words text-lg font-semibold text-foreground"
                  inputClassName="w-full rounded-md border border-primary bg-card px-2 py-0.5 text-lg font-semibold text-foreground outline-none"
                />
              </SheetTitle>
              <div className="text-[12px] text-text-faint">{meta}</div>
            </SheetHeader>

            {reason && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-st-review/30 bg-st-review/10 px-3 py-2 text-[12px] text-st-review">
                <span className="flex items-center gap-1.5">
                  <Bell className="size-3.5" />
                  {reason}
                </span>
                <button
                  onClick={() => patchItem({ snoozedUntil: new Date(Date.now() + 86_400_000).toISOString() })}
                  className="rounded-md border border-st-review/40 px-2 py-0.5 text-[11px] transition hover:bg-st-review/15"
                >
                  Snooze 1d
                </button>
              </div>
            )}
            {snoozed && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-hairline bg-card px-3 py-2 text-[12px] text-text-faint">
                <span className="flex items-center gap-1.5">
                  <Bell className="size-3.5" />
                  Snoozed
                </span>
                <button
                  onClick={() => patchItem({ snoozedUntil: null })}
                  className="rounded-md border border-hairline px-2 py-0.5 text-[11px] transition hover:text-foreground"
                >
                  Unsnooze
                </button>
              </div>
            )}

            {confirmDelete && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-st-blocked/30 bg-st-blocked/10 px-3 py-2.5 text-[12.5px] text-st-blocked">
                <span>Delete this task permanently?</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" className="bg-st-blocked text-white hover:bg-st-blocked/90" onClick={remove}>
                    Delete
                  </Button>
                </div>
              </div>
            )}

            <ItemFields item={item} onPatch={patchItem} />

            {ROLE_META.map(({ role, label, target }) => {
              const srcs = byRole(role);
              if (!srcs.length) return null;
              return (
                <PrGroup
                  key={role}
                  role={role}
                  label={label}
                  target={target}
                  sources={srcs}
                  onPatchSource={patchSource}
                  onRemoveSource={removeSourceFromItem}
                />
              );
            })}

            {links.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">Links</div>
                <div className="flex flex-col gap-1.5">
                  {links.map((s) => {
                    const url = sourceUrl(s);
                    const Wrapper = url ? "a" : "div";
                    return (
                      <div key={s.id} className="group/link flex items-center gap-1.5">
                        <Wrapper
                          {...(url ? { href: url, target: "_blank", rel: "noreferrer" } : {})}
                          className={`flex flex-1 items-center gap-2 rounded-[10px] border border-hairline bg-card p-2.5 text-[12.5px] ${url ? "cursor-pointer transition hover:bg-card-hover" : ""}`}
                        >
                          <span className="text-foreground">{linkLabel(s)}</span>
                          <span className="ml-auto text-[10px] uppercase tracking-[0.06em] text-text-faint">
                            {s.kind === "slack" ? "Slack" : s.kind.startsWith("devrev") ? "DevRev" : "Link"}
                          </span>
                        </Wrapper>
                        <button
                          onClick={() => removeSourceFromItem(s.id)}
                          aria-label="Remove link"
                          className="shrink-0 text-text-faint opacity-0 transition hover:text-st-blocked group-hover/link:opacity-100"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                Add PR / link
              </div>
              <AddSource onAdd={addSourceToItem} />
            </div>

            {item.checklist.length > 0 && (
              <div className="mt-5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                    Pre-merge checklist
                  </span>
                  <span className="rounded-full bg-card px-1.5 py-px text-[11px] text-text-faint">
                    {item.checklist.filter((c) => c.done === 1).length} / {item.checklist.length}
                  </span>
                </div>
                {item.checklist.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => toggleCheck(c.id, c.done === 1)}
                    className="flex w-full items-center gap-2.5 border-b border-hairline py-2 text-left"
                  >
                    <span
                      className={`size-4 shrink-0 rounded-[5px] border ${c.done === 1 ? "border-primary bg-primary" : "border-border"}`}
                    />
                    <span className="text-[12.5px] text-muted-foreground">{c.text}</span>
                    {c.subtext && <span className="ml-auto font-mono text-[10.5px] text-text-faint">{c.subtext}</span>}
                  </button>
                ))}
              </div>
            )}

            <ActivityTimeline id={item.id} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
