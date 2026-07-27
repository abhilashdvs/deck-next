"use client";

import useSWR from "swr";
import type { ActionsRef } from "@/lib/actions-url";
import type { RunDetail } from "@/lib/actions";

// fetch() resolves on any status, so an unchecked r.json() would parse both
// routes' 400/502 error bodies as success — leaving `run` a truthy {error}
// object that never trips the caller's "couldn't load" branch. Throwing here is
// what makes `run === undefined` actually mean "failed".
const fetcher = async <T,>(u: string): Promise<T> => {
  const r = await fetch(u);
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  return r.json();
};

// A null ref means "collapsed" — SWR skips the request entirely, which is how
// run/log detail stays out of the 2-minute sync and off the wire until looked at.
export function useRun(ref: ActionsRef | null) {
  const key = ref ? `/api/actions/run?owner=${ref.owner}&repo=${ref.repo}&runId=${ref.runId}` : null;
  const { data, isLoading, mutate } = useSWR<RunDetail>(key, fetcher);
  return { run: data, isLoading, refresh: () => void mutate() };
}

// `errors: []` is ambiguous on its own — it means both "log read, no ##[error]
// markers in it" and "the log fetch failed". `failed` is what lets the caller
// tell those apart instead of claiming a log it never read has no errors.
export function useJobErrors(ref: ActionsRef | null) {
  const key = ref ? `/api/actions/errors?owner=${ref.owner}&repo=${ref.repo}&jobId=${ref.jobId}` : null;
  const { data, error, isLoading } = useSWR<{ errors: string[]; truncated: number }>(key, fetcher);
  return { errors: data?.errors ?? [], truncated: data?.truncated ?? 0, isLoading, failed: !!error };
}
