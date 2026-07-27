"use client";

import { useState, useEffect, useRef } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { useItems } from "@/hooks/use-items";
import { STATUSES, type ItemFilters, type ItemDetail, type Status } from "@/lib/types";
import { Column } from "./column";
import { Card } from "./card";

const isStatus = (id: string | number): id is Status => STATUSES.includes(id as Status);

export function Board({ filters, onOpen }: { filters: ItemFilters; onOpen: (id: number) => void }) {
  const dragging = useRef(false);
  // Stable callback (created once) so SWR config doesn't change every render.
  const isPaused = useRef(() => dragging.current).current;
  const { items, mutate } = useItems(filters, { isPaused });
  const [local, setLocal] = useState<ItemDetail[]>(items);
  const [activeId, setActiveId] = useState<number | null>(null);

  // Sync from server unless a drag is in progress (avoid clobbering optimistic state).
  useEffect(() => {
    if (!dragging.current) setLocal(items);
  }, [items]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const findItem = (id: number) => local.find((i) => i.id === id);
  const columnOf = (id: string | number): Status | undefined =>
    isStatus(id) ? id : findItem(Number(id))?.status;

  function onDragStart(e: DragStartEvent) {
    dragging.current = true;
    setActiveId(Number(e.active.id));
  }

  // Live reorder — move the active card to where the cursor is, within or across
  // columns, so siblings shift under the cursor instead of snapping only on drop.
  function onDragOver(e: DragOverEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeIdN = Number(active.id);
    const overId = over.id;
    const targetCol = columnOf(overId);
    if (!targetCol) return;

    setLocal((prev) => {
      const from = prev.findIndex((i) => i.id === activeIdN);
      if (from === -1) return prev;
      const active0 = prev[from];
      const overIdx = isStatus(overId) ? -1 : prev.findIndex((i) => i.id === Number(overId));
      if (active0.status === targetCol && (overIdx === from || overIdx === -1)) return prev;

      const without = prev.filter((i) => i.id !== activeIdN);
      const moved = active0.status === targetCol ? active0 : { ...active0, status: targetCol };
      let insertAt: number;
      if (isStatus(overId)) {
        // Hovering an empty area of a column → append to that column.
        let last = -1;
        without.forEach((i, idx) => {
          if (i.status === targetCol) last = idx;
        });
        insertAt = last + 1;
      } else {
        insertAt = without.findIndex((i) => i.id === Number(overId));
        if (insertAt === -1) insertAt = without.length;
      }
      return [...without.slice(0, insertAt), moved, ...without.slice(insertAt)];
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = Number(e.active.id);
    const it = findItem(id);
    if (!it) {
      dragging.current = false;
      setLocal(items);
      return;
    }
    try {
      // Only PATCH status if the drop actually changed columns (a status change
      // locks the item + logs activity); a pure reorder must not do either.
      const serverStatus = items.find((i) => i.id === id)?.status;
      if (serverStatus !== it.status) {
        await fetch(`/api/items/${id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: it.status }),
        });
      }
      // Persist the destination column order in one request.
      const orderedIds = local.filter((i) => i.status === it.status).map((i) => i.id);
      await fetch("/api/items/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      });
    } finally {
      dragging.current = false;
      mutate();
    }
  }

  function onDragCancel() {
    dragging.current = false;
    setActiveId(null);
    setLocal(items);
  }

  const active = activeId != null ? findItem(activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div className="flex flex-1 gap-4 overflow-x-auto p-5">
        {STATUSES.map((s) => (
          <Column key={s} status={s} items={local.filter((i) => i.status === s)} onOpen={onOpen} />
        ))}
      </div>
      <DragOverlay>{active ? <Card item={active} onOpen={() => {}} /> : null}</DragOverlay>
    </DndContext>
  );
}
