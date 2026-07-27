"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { parseSource } from "@/lib/pr";
import type { SourceRole } from "@/lib/types";

const ROLES: { id: SourceRole; label: string }[] = [
  { id: "base", label: "Base" },
  { id: "stacked", label: "Stacked" },
  { id: "docs", label: "Docs" },
];

export function AddSource({
  onAdd,
  autoFocus,
}: {
  onAdd: (src: Record<string, unknown>) => void;
  autoFocus?: boolean;
}) {
  const [url, setUrl] = useState("");
  const [role, setRole] = useState<SourceRole>("base");
  const parsed = parseSource(url);
  const isPr = parsed?.kind === "github_pr";

  function add() {
    if (!parsed) return;
    const src: Record<string, unknown> = { ...parsed };
    if (parsed.kind === "github_pr") {
      src.role = role;
      src.targetBranch = role === "stacked" ? "base PR branch" : "master";
    }
    onAdd(src);
    setUrl("");
    setRole("base");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        autoFocus={autoFocus}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder="Paste a PR URL, repo#123, Slack, or link…"
        className="h-8 min-w-[180px] flex-1 rounded-md border border-hairline bg-card px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-text-faint focus:border-primary"
      />
      {isPr && (
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as SourceRole)}
          aria-label="PR role"
          className="h-8 cursor-pointer rounded-md border border-hairline bg-card px-2 text-[12px] text-foreground outline-none"
        >
          {ROLES.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={add}
        disabled={!parsed}
        className="flex h-8 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="size-3.5" />
        Add
      </button>
    </div>
  );
}
