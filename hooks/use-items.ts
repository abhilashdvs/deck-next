"use client";

import useSWR from "swr";
import type { ItemDetail, ItemFilters } from "@/lib/types";

const fetcher = (u: string): Promise<ItemDetail[]> => fetch(u).then((r) => r.json());

// Stable references so a loading/undefined `data` doesn't hand out a fresh
// array (or fresh isPaused fn) every render — that churns effects downstream.
const EMPTY: ItemDetail[] = [];
const NEVER = () => false;

export function itemsKey(filters: ItemFilters = {}): string {
  const entries = Object.entries(filters).filter(([, v]) => v != null && v !== "") as [string, string][];
  const qs = new URLSearchParams(entries).toString();
  return `/api/items${qs ? `?${qs}` : ""}`;
}

export function useItems(filters: ItemFilters = {}, opts: { isPaused?: () => boolean } = {}) {
  const { data, mutate, isLoading } = useSWR<ItemDetail[]>(itemsKey(filters), fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
    revalidateOnFocus: false,
    isPaused: opts.isPaused ?? NEVER,
  });
  return { items: data ?? EMPTY, mutate, isLoading };
}
