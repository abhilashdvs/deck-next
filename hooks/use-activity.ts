"use client";

import useSWR from "swr";
import type { Activity } from "@/lib/types";

const fetcher = (u: string): Promise<Activity[]> => fetch(u).then((r) => r.json());

export function useActivity(id: number | null) {
  const { data } = useSWR<Activity[]>(id != null ? `/api/items/${id}/activity` : null, fetcher);
  return { activity: data ?? [] };
}
