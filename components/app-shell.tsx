"use client";

import { useState } from "react";
import { useSWRConfig } from "swr";
import type { ItemFilters } from "@/lib/types";
import { TopBar } from "./top-bar";
import { Board } from "./board/board";
import { MyPrsView } from "@/components/my-prs/my-prs-view";
import { DetailSheet } from "@/components/detail/detail-sheet";
import { CommandPalette } from "@/components/command/command-palette";
import { authHeaders } from "@/lib/pat";

export type View = "board" | "prs";

export function AppShell() {
  const [filters, setFilters] = useState<ItemFilters>({});
  const [openId, setOpenId] = useState<number | null>(null);
  const [view, setView] = useState<View>("board");
  const [prsSyncing, setPrsSyncing] = useState(false);
  const { mutate } = useSWRConfig();
  const revalidate = () => mutate((k) => typeof k === "string" && k.startsWith("/api/items"));

  async function syncMyPrs() {
    if (prsSyncing) return;
    setPrsSyncing(true);
    try {
      await fetch("/api/my-prs/sync", { method: "POST", headers: authHeaders() });
      mutate("/api/my-prs");
    } finally {
      setPrsSyncing(false);
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <TopBar filters={filters} setFilters={setFilters} view={view} onViewChange={setView} />
      {view === "board" ? (
        <Board filters={filters} onOpen={setOpenId} />
      ) : (
        <MyPrsView syncing={prsSyncing} onSync={syncMyPrs} />
      )}
      <DetailSheet id={openId} onClose={() => setOpenId(null)} onChanged={revalidate} />
      <CommandPalette onOpenItem={setOpenId} revalidate={revalidate} setFilters={setFilters} />
    </div>
  );
}
