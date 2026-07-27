import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { SWRConfig } from "swr";
import type { ReactNode } from "react";
import { useRun, useJobErrors } from "@/hooks/use-run";

// These hooks look like thin SWR bindings, but two lines in them carry the
// whole error-surfacing contract of the failing-checks panel: the fetcher's
// `!r.ok` throw, and `failed: !!error`. Delete either and every failed log
// fetch renders as "No error markers in this log" — an affirmative all-clear
// on a broken request. Nothing else in the suite would notice.

const REF = { owner: "acme", repo: "magic-onboarding", runId: "29325766675", jobId: "87061580817" };

const RUN = { name: "CI", status: "completed", conclusion: "failure", attempt: 1, jobs: [] };

// A fresh cache per test. SWR's default cache is module-global, so without
// this a hook that never fetched would still read a neighbouring test's data
// and pass. errorRetryCount 0 keeps failed revalidations from leaving retry
// timers running past the test.
function wrapper({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, errorRetryCount: 0 }}>{children}</SWRConfig>
  );
}

const realFetch = global.fetch;

function mockFetch(value: unknown) {
  global.fetch = vi.fn().mockResolvedValue(value) as unknown as typeof fetch;
}

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const notOk = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = realFetch;
});

describe("useRun", () => {
  it("fetches the run detail for a ref", async () => {
    mockFetch(ok(RUN));
    const { result } = renderHook(() => useRun(REF), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(RUN));
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/actions/run?owner=acme&repo=magic-onboarding&runId=29325766675",
    );
  });

  // The conditional key is what makes fetch-on-expand work: a collapsed check
  // passes null and must stay off the wire entirely.
  it("issues no request at all for a null ref", async () => {
    mockFetch(ok(RUN));
    const { result } = renderHook(() => useRun(null), { wrapper });
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.run).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  // fetch() resolves on a 400/502 too. Without the fetcher's throw, `run` would
  // hold a truthy {error: "..."} object and the panel's "couldn't load this
  // run" branch would never be reached.
  it("leaves run undefined when the route answers with an error status", async () => {
    mockFetch(notOk(502, { error: "gh: Not Found" }));
    const { result } = renderHook(() => useRun(REF), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.run).toBeUndefined();
  });

  it("refresh() revalidates just this run", async () => {
    mockFetch(ok(RUN));
    const { result } = renderHook(() => useRun(REF), { wrapper });
    await waitFor(() => expect(result.current.run).toEqual(RUN));
    await act(async () => {
      result.current.refresh();
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  });
});

describe("useJobErrors", () => {
  it("returns the extracted errors and truncated count", async () => {
    mockFetch(ok({ errors: ["totp.go:59:1: not formatted"], truncated: 3 }));
    const { result } = renderHook(() => useJobErrors(REF), { wrapper });
    await waitFor(() => expect(result.current.errors).toEqual(["totp.go:59:1: not formatted"]));
    expect(result.current.truncated).toBe(3);
    expect(result.current.failed).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/actions/errors?owner=acme&repo=magic-onboarding&jobId=87061580817",
    );
  });

  // The load-bearing one. A non-ok response must reach `failed`, because
  // `errors: []` alone cannot distinguish "log read, nothing in it" from "the
  // log was never read" — and the panel says "No error markers in this log"
  // for the former.
  it("reports failed on a non-ok response instead of an empty all-clear", async () => {
    mockFetch(notOk(502, { error: "gh: HTTP 403" }));
    const { result } = renderHook(() => useJobErrors(REF), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errors).toEqual([]);
    expect(result.current.truncated).toBe(0);
  });

  it("reports failed when the request itself throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    const { result } = renderHook(() => useJobErrors(REF), { wrapper });
    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.errors).toEqual([]);
  });

  it("issues no request at all for a null ref", async () => {
    mockFetch(ok({ errors: [], truncated: 0 }));
    const { result } = renderHook(() => useJobErrors(null), { wrapper });
    await act(async () => {});
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  // While in flight there is no data and no error yet: the defaults must not
  // let the panel claim either "no error markers" or "couldn't load".
  it("defaults to no errors, nothing truncated and not failed while in flight", () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const { result } = renderHook(() => useJobErrors(REF), { wrapper });
    expect(result.current.errors).toEqual([]);
    expect(result.current.truncated).toBe(0);
    expect(result.current.failed).toBe(false);
    expect(result.current.isLoading).toBe(true);
  });

  // A 200 body missing the fields (a shape change on the route) must not throw.
  it("defaults sanely when the payload omits the fields", async () => {
    mockFetch(ok({}));
    const { result } = renderHook(() => useJobErrors(REF), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.errors).toEqual([]);
    expect(result.current.truncated).toBe(0);
    expect(result.current.failed).toBe(false);
  });
});
