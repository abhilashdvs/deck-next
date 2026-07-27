"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";

export function NotesEditor({
  value,
  onCommit,
}: {
  value: string | null;
  onCommit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  useEffect(() => setVal(value ?? ""), [value]);

  if (editing) {
    return (
      <textarea
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (val !== (value ?? "")) onCommit(val);
        }}
        placeholder="Add notes (markdown supported)…"
        className="min-h-[110px] w-full rounded-lg border border-hairline bg-card p-2.5 font-mono text-[12.5px] text-foreground outline-none focus:border-primary"
      />
    );
  }
  return (
    <div
      onClick={() => setEditing(true)}
      className="min-h-[44px] cursor-text rounded-lg border border-hairline bg-card p-2.5 text-[12.5px] leading-relaxed text-muted-foreground [&_a]:text-primary [&_a]:underline [&_code]:font-mono [&_h1]:font-semibold [&_h1]:text-foreground [&_h2]:font-semibold [&_h2]:text-foreground [&_li]:ml-4 [&_li]:list-disc [&_strong]:text-foreground"
    >
      {value ? (
        <ReactMarkdown
          components={{
            a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          }}
        >
          {value}
        </ReactMarkdown>
      ) : (
        <span className="text-text-faint">Add notes…</span>
      )}
    </div>
  );
}
