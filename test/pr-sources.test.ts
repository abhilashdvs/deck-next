import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { createItem, getItem } from "@/lib/model/items";
import { addSource, removeSource } from "@/lib/model/sources";
import { parseSource, prChecks, checksFailingCount, anyChecksFailing } from "@/lib/pr";
import type { LinkedSource, PrChecks } from "@/lib/types";

describe("parseSource", () => {
  it("parses a github PR url", () => {
    expect(parseSource("https://github.com/acme/api/pull/123")).toMatchObject({
      kind: "github_pr",
      repo: "api",
      number: 123,
      externalId: "api#123",
    });
  });
  it("parses repo#number shorthand", () => {
    expect(parseSource("terminals#4444")).toMatchObject({
      kind: "github_pr",
      repo: "terminals",
      number: 4444,
    });
  });
  it("detects slack + generic urls, rejects junk", () => {
    expect(parseSource("https://x.slack.com/archives/abc")?.kind).toBe("slack");
    expect(parseSource("https://example.com/x")?.kind).toBe("url");
    expect(parseSource("not a link")).toBeNull();
  });
});

describe("addSource / removeSource", () => {
  let db: DrizzleDb;
  beforeEach(() => {
    db = getDb(":memory:");
  });

  it("adds a PR and removes it", () => {
    const it0 = createItem(db, { title: "x" });
    const src = addSource(db, it0.id, {
      kind: "github_pr",
      externalId: "api#1",
      repo: "api",
      number: 1,
      role: "base",
    });
    expect(getItem(db, it0.id)!.sources).toHaveLength(1);
    removeSource(db, src.id);
    expect(getItem(db, it0.id)!.sources).toHaveLength(0);
  });

  it("re-links an existing PR instead of duplicating (unique kind+external_id)", () => {
    const a = createItem(db, { title: "a" });
    const b = createItem(db, { title: "b" });
    addSource(db, a.id, { kind: "github_pr", externalId: "api#9", repo: "api", number: 9, role: "base" });
    addSource(db, b.id, { kind: "github_pr", externalId: "api#9", repo: "api", number: 9, role: "stacked" });
    expect(getItem(db, a.id)!.sources).toHaveLength(0);
    const bs = getItem(db, b.id)!.sources;
    expect(bs).toHaveLength(1);
    expect(bs[0].role).toBe("stacked");
  });
});

describe("check helpers", () => {
  const checks = (o: Partial<PrChecks> = {}): PrChecks => ({
    required: 3,
    passing: 3,
    failing: 0,
    pending: 0,
    failed: [],
    ...o,
  });
  const src = (o: Partial<LinkedSource> = {}): LinkedSource =>
    ({ id: 1, itemId: 1, kind: "github_pr", state: "open", meta: null, ...o }) as LinkedSource;

  it("reads a PrChecks object out of meta", () => {
    expect(prChecks(src({ meta: { checks: checks() } }))?.required).toBe(3);
  });

  it("returns null when meta has no checks", () => {
    expect(prChecks(src())).toBeNull();
    expect(prChecks(src({ meta: { review: "approved" } }))).toBeNull();
  });

  it("sums failing counts across PRs", () => {
    const sources = [
      src({ meta: { checks: checks({ failing: 2 }) } }),
      src({ meta: { checks: checks({ failing: 1 }) } }),
      src({ meta: { checks: checks() } }),
    ];
    expect(checksFailingCount(sources)).toBe(3);
    expect(anyChecksFailing(sources)).toBe(true);
  });

  it("is quiet when nothing is failing", () => {
    expect(anyChecksFailing([src({ meta: { checks: checks() } })])).toBe(false);
    expect(checksFailingCount([src()])).toBe(0);
  });

  it("ignores failing checks on merged and closed PRs", () => {
    const merged = src({ state: "merged", meta: { checks: checks({ failing: 4 }) } });
    const closed = src({ state: "closed", meta: { checks: checks({ failing: 2 }) } });
    expect(anyChecksFailing([merged, closed])).toBe(false);
    expect(checksFailingCount([merged, closed])).toBe(0);
  });
});
