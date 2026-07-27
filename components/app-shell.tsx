"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { ItemFilters } from "@/lib/types";
import { TopBar } from "./top-bar";
import { Board } from "./board/board";
import { DetailSheet } from "@/components/detail/detail-sheet";
import { CommandPalette } from "@/components/command/command-palette";

export function AppShell() {
  const [filters, setFilters] = useState<ItemFilters>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const { mutate } = useSWRConfig();
  const revalidate = () => mutate((k) => typeof k === "string" && k.startsWith("/api/items"));

  return (
    <div className="flex h-screen flex-col">
      <TopBar filters={filters} setFilters={setFilters} />
      <Board filters={filters} onOpen={setOpenId} />
      <DetailSheet id={openId} onClose={() => setOpenId(null)} onChanged={revalidate} />
      <CommandPalette onOpenItem={setOpenId} revalidate={revalidate} setFilters={setFilters} />
    </div>
  );
}
