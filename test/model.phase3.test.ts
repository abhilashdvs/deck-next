import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { createItem, updateItem, getItem, listItems } from "@/lib/model/items";
import { addSource } from "@/lib/model/sources";
import { listActivity } from "@/lib/model/activity";
import { createView, listViews, deleteView } from "@/lib/model/views";
import { attentionReason } from "@/lib/attention";
import type { ItemDetail } from "@/lib/types";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

describe("saved views", () => {
  it("creates, lists, and deletes with a round-tripped filter", () => {
    const v = createView(db, "Blocked work", { status: "blocked", priority: "p0" });
    expect(v.id).toBeGreaterThan(0);
    expect(v.filter).toEqual({ status: "blocked", priority: "p0" });
    expect(listViews(db)).toHaveLength(1);
    deleteView(db, v.id);
    expect(listViews(db)).toHaveLength(0);
  });
});

describe("activity log", () => {
  it("logs creation then status change, newest first", () => {
    const it0 = createItem(db, { title: "x" });
    updateItem(db, it0.id, { status: "in_review" });
    const acts = listActivity(db, it0.id);
    expect(acts.map((a) => a.type)).toEqual(["status", "created"]);
    expect(acts[0].summary).toContain("In review");
  });

  it("logs a linked source", () => {
    const it0 = createItem(db, { title: "x" });
    addSource(db, it0.id, { kind: "github_pr", repo: "api", number: 66 });
    expect(listActivity(db, it0.id).some((a) => a.type === "source_linked")).toBe(true);
  });

  it("does not log a no-op status patch", () => {
    const it0 = createItem(db, { title: "x" });
    updateItem(db, it0.id, { status: "todo" });
    expect(listActivity(db, it0.id).filter((a) => a.type === "status")).toHaveLength(0);
  });
});

describe("attentionReason", () => {
  const base = (o: Partial<ItemDetail>): ItemDetail => ({
    id: 1,
    title: "t",
    type: "task",
    status: "todo",
    statusLocked: 0,
    priority: null,
    nextAction: null,
    notes: null,
    blockedReason: null,
    tags: [],
    position: 0,
    snoozedUntil: null,
    createdAt: "",
    updatedAt: new Date().toISOString(),
    sources: [],
    checklist: [],
    ...o,
  });
  const now = Date.now();
  const old = new Date(now - 10 * 86_400_000).toISOString();

  it("stays quiet for a fresh item", () => {
    expect(attentionReason(base({}), now)).toBeNull();
  });
  it("flags a long-blocked item", () => {
    expect(attentionReason(base({ status: "blocked", updatedAt: old }), now)).toBe("Blocked over a week");
  });
  it("flags stale in-review", () => {
    expect(attentionReason(base({ status: "in_review", updatedAt: old }), now)).toBe(
      "Awaiting review 3+ days",
    );
  });
  it("goes quiet when snoozed into the future", () => {
    const future = new Date(now + 86_400_000).toISOString();
    expect(
      attentionReason(base({ status: "blocked", updatedAt: old, snoozedUntil: future }), now),
    ).toBeNull();
  });

  it("flags an item whose PR has failing required checks", () => {
    const item = base({
      status: "in_progress",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 9, passing: 5, failing: 4, pending: 0, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBe("Required checks failing");
  });

  it("stays quiet when required checks are only pending", () => {
    const item = base({
      status: "in_progress",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 3, passing: 1, failing: 0, pending: 2, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBeNull();
  });

  it("stays quiet about failing checks on a done item", () => {
    const item = base({
      status: "done",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 3, passing: 0, failing: 3, pending: 0, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBeNull();
  });
});

describe("needsAttention filter", () => {
  it("returns only items that currently need attention", () => {
    const c = createItem(db, { title: "conflicted" });
    addSource(db, c.id, { kind: "github_pr", repo: "api", number: 1, mergeable: "conflicting" });
    createItem(db, { title: "fine" });
    const got = getItem(db, c.id)!;
    expect(attentionReason(got, Date.now())).toBe("PR has conflicts");
    expect(listItems(db, { needsAttention: true }).map((i) => i.title)).toEqual(["conflicted"]);
  });
});
