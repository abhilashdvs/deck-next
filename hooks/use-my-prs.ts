"use client";

import useSWR from "swr";
import type { MyPr } from "@/lib/model/my-prs";

const fetcher = (u: string): Promise<MyPr[]> => fetch(u).then((r) => r.json());

const EMPTY: MyPr[] = [];
const NEVER = () => false;

export function useMyPrs(opts: { isPaused?: () => boolean } = {}) {
  const { data, mutate, isLoading } = useSWR<MyPr[]>("/api/my-prs", fetcher, {
    refreshInterval: 10000,
    keepPreviousData: true,
    revalidateOnFocus: false,
    isPaused: opts.isPaused ?? NEVER,
  });
  return { prs: data ?? EMPTY, mutate, isLoading };
}
