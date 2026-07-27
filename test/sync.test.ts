import { describe, it, expect } from "vitest";
import { normalizePr, normalizeChecks } from "@/lib/sync";

describe("normalizePr", () => {
  it("merged when mergedAt present", () => {
    expect(normalizePr({ mergedAt: "2026-01-01", mergeable: "MERGEABLE" }).state).toBe("merged");
  });
  it("draft when isDraft", () => {
    expect(normalizePr({ isDraft: true, state: "OPEN" }).state).toBe("draft");
  });
  it("closed when state CLOSED", () => {
    expect(normalizePr({ state: "CLOSED" }).state).toBe("closed");
  });
  it("open otherwise", () => {
    expect(normalizePr({ state: "OPEN" }).state).toBe("open");
  });
  it("maps CONFLICTING mergeable to conflicting", () => {
    expect(normalizePr({ state: "OPEN", mergeable: "CONFLICTING" }).mergeable).toBe("conflicting");
  });
  // GitHub returns UNKNOWN while it's still computing the merge commit — this
  // is "ask again later", not a real state change. Returning undefined (not
  // the string "unknown") lets updateSource's existing `!== undefined` guard
  // preserve whatever mergeable value was already stored, instead of
  // clobbering a real "conflicting" with a transient "unknown" every sync.
  it("returns undefined mergeable when GitHub hasn't computed it yet, so the last known value survives", () => {
    expect(normalizePr({ state: "OPEN" }).mergeable).toBeUndefined();
    expect(normalizePr({ state: "OPEN", mergeable: "UNKNOWN" }).mergeable).toBeUndefined();
  });
  it("counts comments + reviews", () => {
    expect(normalizePr({ state: "OPEN", comments: [1, 2], reviews: [1] }).commentsCount).toBe(3);
  });
});

describe("normalizeChecks", () => {
  const run = (o: Record<string, unknown> = {}) => ({
    __typename: "CheckRun",
    name: "Lint",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://ci/1",
    isRequired: true,
    ...o,
  });
  const ctx = (o: Record<string, unknown> = {}) => ({
    __typename: "StatusContext",
    context: "quality-gate-slit",
    state: "SUCCESS",
    targetUrl: "https://ci/2",
    isRequired: true,
    ...o,
  });

  it("counts required CheckRun and StatusContext nodes together", () => {
    expect(normalizeChecks([run(), ctx()])).toMatchObject({
      required: 2,
      passing: 2,
      failing: 0,
      pending: 0,
    });
  });

  it("ignores non-required nodes entirely, even failing ones", () => {
    const r = normalizeChecks([run({ isRequired: false, conclusion: "FAILURE" }), run()]);
    expect(r).toMatchObject({ required: 1, passing: 1, failing: 0 });
    expect(r.failed).toEqual([]);
  });

  it("treats SKIPPED and NEUTRAL as passing", () => {
    expect(normalizeChecks([run({ conclusion: "SKIPPED" }), run({ conclusion: "NEUTRAL" })])).toMatchObject({
      passing: 2,
      failing: 0,
    });
  });

  it("maps every CheckRun failure conclusion to failing", () => {
    for (const c of ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
      expect(normalizeChecks([run({ conclusion: c })]).failing).toBe(1);
    }
  });

  it("records name and url for a failing CheckRun", () => {
    const r = normalizeChecks([run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/x" })]);
    expect(r.failed).toEqual([{ name: "Lint", url: "https://ci/x" }]);
  });

  it("maps StatusContext FAILURE and ERROR to failing with context + targetUrl", () => {
    const r = normalizeChecks([ctx({ state: "FAILURE", context: "quality-gate-ut", targetUrl: "https://ci/u" })]);
    expect(r).toMatchObject({ failing: 1 });
    expect(r.failed).toEqual([{ name: "quality-gate-ut", url: "https://ci/u" }]);
    expect(normalizeChecks([ctx({ state: "ERROR" })]).failing).toBe(1);
  });

  it("treats an in-flight CheckRun as pending even with a stale conclusion", () => {
    expect(normalizeChecks([run({ status: "IN_PROGRESS", conclusion: "SUCCESS" })])).toMatchObject({
      pending: 1,
      passing: 0,
      failing: 0,
    });
  });

  it("treats StatusContext PENDING and EXPECTED as pending", () => {
    expect(normalizeChecks([ctx({ state: "PENDING" }), ctx({ state: "EXPECTED" })])).toMatchObject({
      pending: 2,
    });
  });

  it("returns a zero value for an empty or missing rollup", () => {
    const zero = { required: 0, passing: 0, failing: 0, pending: 0, failed: [] };
    expect(normalizeChecks([])).toEqual(zero);
    expect(normalizeChecks(undefined)).toEqual(zero);
    expect(normalizeChecks(null)).toEqual(zero);
  });

  it("keeps both failures when two required checks share a name", () => {
    const r = normalizeChecks([
      run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/a" }),
      run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/b" }),
    ]);
    expect(r.failing).toBe(2);
    expect(r.failed).toEqual([
      { name: "Lint", url: "https://ci/a" },
      { name: "Lint", url: "https://ci/b" },
    ]);
  });

  it("defaults a missing url to null", () => {
    const r = normalizeChecks([run({ conclusion: "FAILURE", detailsUrl: null })]);
    expect(r.failed).toEqual([{ name: "Lint", url: null }]);
  });
});
