"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { ItemDetail, Status } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";
import { STATUS_COLOR } from "@/lib/pr";
import { SortableCard } from "./sortable-card";

export function Column({
  status,
  items,
  onOpen,
}: {
  status: Status;
  items: ItemDetail[];
  onOpen: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="w-[236px] shrink-0">
      <div className="flex items-center gap-2 px-1 pb-3">
        <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-text-faint">
          {STATUS_LABELS[status]}
        </span>
        <span className="rounded-full bg-card px-1.5 py-px text-[11px] text-text-faint">{items.length}</span>
      </div>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={`flex min-h-[80px] flex-col gap-2.5 rounded-lg transition-colors ${isOver ? "bg-foreground/[0.03]" : ""}`}
        >
          {items.map((i) => (
            <SortableCard key={i.id} item={i} onOpen={onOpen} />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}
