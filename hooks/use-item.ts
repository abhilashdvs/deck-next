"use client";

import useSWR from "swr";
import type { ItemDetail } from "@/lib/types";

const fetcher = (u: string): Promise<ItemDetail> => fetch(u).then((r) => r.json());

export function useItem(id: number | null) {
  const { data, mutate } = useSWR<ItemDetail>(id != null ? `/api/items/${id}` : null, fetcher);
  return { item: data ?? null, mutate };
}
