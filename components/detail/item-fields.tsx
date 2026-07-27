"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { ItemDetail } from "@/lib/types";
import { EditableText } from "./editable-text";
import { TagInput } from "./tag-input";
import { NotesEditor } from "./notes-editor";

function CollapsedFieldsRow({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-1.5 text-[12px] text-text-faint">
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        + next action
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        tag
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        note
      </button>
    </div>
  );
}

export function ItemFields({
  item,
  onPatch,
}: {
  item: ItemDetail;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [forceReveal, setForceReveal] = useState(false);
  const hasAnyContent = !!item.nextAction || item.tags.length > 0 || !!item.notes;
  const showCollapsed = !hasAnyContent && !forceReveal;

  return (
    <>
      {item.status === "blocked" && (
        <div className="mt-2.5 flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-st-blocked" />
          <EditableText
            value={item.blockedReason}
            onCommit={(v) => onPatch({ blockedReason: v || null })}
            placeholder="Why is this blocked?"
            displayClassName="text-[12.5px] text-st-blocked"
            inputClassName="flex-1 rounded-md border border-st-blocked/40 bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
          />
        </div>
      )}

      {showCollapsed ? (
        <CollapsedFieldsRow onReveal={() => setForceReveal(true)} />
      ) : (
        <>
          <div className="mt-4 flex items-start gap-1.5">
            <span className="mt-0.5 text-[12.5px] text-primary">→</span>
            <EditableText
              value={item.nextAction}
              onCommit={(v) => onPatch({ nextAction: v || null })}
              placeholder="Add a next action…"
              displayClassName="text-[12.5px] text-muted-foreground"
              inputClassName="flex-1 rounded-md border border-primary bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
            />
          </div>

          <div className="mt-4">
            <TagInput tags={item.tags} onChange={(t) => onPatch({ tags: t })} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">Notes</div>
            <NotesEditor value={item.notes} onCommit={(v) => onPatch({ notes: v || null })} />
          </div>
        </>
      )}
    </>
  );
}
