"use client";

import useSWR from "swr";
import type { SavedView, ItemFilters } from "@/lib/types";

const fetcher = (u: string): Promise<SavedView[]> => fetch(u).then((r) => r.json());

export function useViews() {
  const { data, mutate } = useSWR<SavedView[]>("/api/views", fetcher);

  async function create(name: string, filter: ItemFilters) {
    await fetch("/api/views", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, filter }),
    });
    mutate();
  }

  async function remove(id: number) {
    await fetch(`/api/views/${id}`, { method: "DELETE" });
    mutate();
  }

  return { views: data ?? [], create, remove };
}
