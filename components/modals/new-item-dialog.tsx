"use client";

import { useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X } from "lucide-react";
import { AddSource } from "@/components/detail/add-source";
import { STATUSES, STATUS_LABELS } from "@/lib/types";

const TYPES = ["feature", "bug", "oncall", "task", "chore"];
const PRIOS: [string, string][] = [
  ["", "—"],
  ["p0", "P0"],
  ["p1", "P1"],
  ["p2", "P2"],
  ["p3", "P3"],
];

const selectCls =
  "h-9 rounded-lg border border-hairline bg-card px-2.5 text-[13px] text-foreground outline-none focus:border-primary";
const labelText = "text-[10.5px] font-semibold uppercase tracking-[0.07em] text-text-faint";

function sourceLabel(s: Record<string, unknown>): string {
  if (s.kind === "github_pr") return `${s.repo} #${s.number}`;
  if (s.kind === "slack") return "Slack thread";
  return String(s.url ?? "Link");
}

export function NewItemDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [type, setType] = useState("feature");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("todo");
  const [next, setNext] = useState("");
  const [sources, setSources] = useState<Record<string, unknown>[]>([]);

  function reset() {
    setTitle("");
    setNext("");
    setSources([]);
    setPriority("");
    setType("feature");
    setStatus("todo");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const created = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: t,
        type,
        status,
        priority: priority || null,
        nextAction: next.trim() || null,
      }),
    }).then((r) => r.json());

    if (created?.id) {
      let order = 1;
      for (const s of sources) {
        const body = { ...s } as Record<string, unknown>;
        if (s.kind === "github_pr") body.mergeOrder = order++;
        await fetch(`/api/items/${created.id}/sources`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    }

    reset();
    setOpen(false);
    onCreated();
  }

  return (
    <>
      <button
        aria-label="New item"
        title="New item"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 font-mono text-[12.5px] font-medium text-primary-foreground transition hover:brightness-110 active:scale-[0.97]"
      >
        <span className="opacity-50">[</span>+ new<span className="opacity-50">]</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>New item</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelText}>Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What needs doing?" autoFocus required />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelText}>Type</span>
                <select className={selectCls} value={type} onChange={(e) => setType(e.target.value)}>
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1.5">
                <span className={labelText}>Priority</span>
                <select className={selectCls} value={priority} onChange={(e) => setPriority(e.target.value)}>
                  {PRIOS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className={labelText}>Status</span>
              <select className={selectCls} value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelText}>Next action</span>
              <Input value={next} onChange={(e) => setNext(e.target.value)} placeholder="Your next move (optional)" />
            </label>

            <div className="flex flex-col gap-1.5">
              <span className={labelText}>Pull requests &amp; links</span>
              {sources.length > 0 && (
                <div className="flex flex-col gap-1">
                  {sources.map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-md border border-hairline bg-card px-2 py-1 text-[12px]"
                    >
                      <span className="font-mono text-foreground">{sourceLabel(s)}</span>
                      {s.kind === "github_pr" && (
                        <span className="rounded bg-accent-tint px-1.5 py-px text-[10px] uppercase tracking-wide text-primary">
                          {String(s.role)}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="Remove"
                        onClick={() => setSources((prev) => prev.filter((_, j) => j !== i))}
                        className="ml-auto text-text-faint hover:text-st-blocked"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <AddSource onAdd={(src) => setSources((prev) => [...prev, src])} />
            </div>

            <DialogFooter>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
