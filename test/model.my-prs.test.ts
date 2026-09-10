import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { listMyPrs, upsertMyPr, replaceMyPrs, type MyPrInput } from "@/lib/model/my-prs";
import { bucketizeMyPrs, prBucket, failingCount, conflictsCount, repoCounts } from "@/lib/my-prs";
import type { MyPr } from "@/lib/model/my-prs";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

const input = (o: Partial<MyPrInput> = {}): MyPrInput => ({
  externalId: "api#1",
  repo: "api",
  number: 1,
  title: "Fix the thing",
  url: "https://github.com/acme/api/pull/1",
  state: "open",
  role: "author",
  updatedAt: "2026-07-18T10:00:00Z",
  ...o,
});

describe("my_prs model", () => {
  it("inserts and reads back with checks hydrated", () => {
    upsertMyPr(db, input({ checks: { required: 3, passing: 3, failing: 0, pending: 0, failed: [] } }));
    const rows = listMyPrs(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].repo).toBe("api");
    expect(rows[0].checks?.required).toBe(3);
    expect(rows[0].role).toBe("author");
  });

  it("upserts by externalId instead of duplicating", () => {
    upsertMyPr(db, input({ title: "first" }));
    upsertMyPr(db, input({ title: "second", role: "reviewer" }));
    const rows = listMyPrs(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("second");
    expect(rows[0].role).toBe("reviewer");
  });

  it("replaceMyPrs drops rows absent from the new sync", () => {
    upsertMyPr(db, input({ externalId: "api#1" }));
    upsertMyPr(db, input({ externalId: "api#2", number: 2, url: "https://github.com/acme/api/pull/2" }));
    expect(listMyPrs(db)).toHaveLength(2);
    replaceMyPrs(db, [input({ externalId: "api#2", number: 2, url: "https://github.com/acme/api/pull/2" })]);
    const rows = listMyPrs(db);
    expect(rows).toHaveLength(1);
    expect(rows[0].externalId).toBe("api#2");
  });
});

describe("my-prs priority buckets", () => {
  const pr = (o: Partial<MyPr> = {}): MyPr => ({
    id: 1,
    externalId: "api#1",
    repo: "api",
    number: 1,
    title: "t",
    url: "",
    state: "open",
    isDraft: 0,
    role: "author",
    reviewDecision: null,
    mergeable: null,
    commentsCount: null,
    unresolvedThreads: null,
    checks: null,
    updatedAt: "",
    lastSyncedAt: "",
    ...o,
  });
  const checks = (failing: number, pending = 0) => ({ required: 3, passing: 3 - failing - pending, failing, pending, failed: [] });

  it("conflicts land in action", () => {
    expect(prBucket(pr({ mergeable: "conflicting" }))).toBe("action");
  });

  it("failing checks land in action", () => {
    expect(prBucket(pr({ checks: checks(2) }))).toBe("action");
  });

  it("changes requested lands in action", () => {
    expect(prBucket(pr({ reviewDecision: "changes_requested" }))).toBe("action");
  });

  it("unresolved threads land in action", () => {
    expect(prBucket(pr({ unresolvedThreads: 2 }))).toBe("action");
  });

  it("approved + green checks land in ready", () => {
    expect(prBucket(pr({ reviewDecision: "approved", checks: checks(0) }))).toBe("ready");
  });

  it("approved but conflicting is action, not ready", () => {
    expect(prBucket(pr({ reviewDecision: "approved", checks: checks(0), mergeable: "conflicting" }))).toBe("action");
  });

  it("pending checks land in waiting", () => {
    expect(prBucket(pr({ checks: checks(0, 2) }))).toBe("waiting");
  });

  it("a plain open PR with review required lands in waiting", () => {
    expect(prBucket(pr({ reviewDecision: "review_required" }))).toBe("waiting");
  });

  it("bucketize groups and preserves order within a bucket", () => {
    const a = pr({ id: 1, externalId: "a#1", mergeable: "conflicting" });
    const b = pr({ id: 2, externalId: "b#2", reviewDecision: "approved", checks: checks(0) });
    const c = pr({ id: 3, externalId: "c#3", checks: checks(1) });
    const d = pr({ id: 4, externalId: "d#4" });
    const out = bucketizeMyPrs([a, b, c, d]);
    expect(out.action.map((p) => p.externalId)).toEqual(["a#1", "c#3"]);
    expect(out.ready.map((p) => p.externalId)).toEqual(["b#2"]);
    expect(out.waiting.map((p) => p.externalId)).toEqual(["d#4"]);
  });
});

describe("my-prs counts", () => {
  const pr = (o: Partial<MyPr> = {}): MyPr => ({
    id: 1, externalId: "api#1", repo: "api", number: 1, title: "t", url: "", state: "open",
    isDraft: 0, role: "author", reviewDecision: null, mergeable: null, commentsCount: null,
    unresolvedThreads: null, checks: null, updatedAt: "", lastSyncedAt: "", ...o,
  });
  const checks = (failing: number) => ({ required: 3, passing: 3 - failing, failing, pending: 0, failed: [] });

  it("counts failing and conflicts", () => {
    const list = [pr({ checks: checks(2) }), pr({ mergeable: "conflicting" }), pr()];
    expect(failingCount(list)).toBe(1);
    expect(conflictsCount(list)).toBe(1);
  });

  it("repoCounts sorts by count desc", () => {
    const list = [pr({ repo: "api" }), pr({ repo: "api" }), pr({ repo: "terminals", externalId: "t#1" })];
    expect(repoCounts(list)).toEqual([
      { repo: "api", count: 2 },
      { repo: "terminals", count: 1 },
    ]);
  });
});
