"use client";

import { useState } from "react";
import { X, Hash } from "lucide-react";

export function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [val, setVal] = useState("");

  function add() {
    const t = val.trim().toLowerCase().replace(/^#/, "");
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setVal("");
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Hash className="size-3.5 text-text-faint" />
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 rounded-md bg-accent-tint px-1.5 py-0.5 text-[11px] text-primary"
        >
          {t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            aria-label={`Remove tag ${t}`}
            className="text-primary/70 hover:text-primary"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="add tag…"
        className="w-24 bg-transparent text-[12px] text-foreground outline-none placeholder:text-text-faint"
      />
    </div>
  );
}
