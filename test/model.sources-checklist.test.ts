import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { createItem, getItem } from "@/lib/model/items";
import { addSource, updateSource } from "@/lib/model/sources";
import { addChecklist, setChecklistDone, removeChecklist } from "@/lib/model/checklist";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

it("attaches a source with meta and reads it back", () => {
  const item = createItem(db, { title: "PR item" });
  const s = addSource(db, item.id, {
    kind: "github_pr",
    externalId: "api#1",
    repo: "api",
    number: 1,
    state: "open",
    role: "base",
    targetBranch: "master",
    meta: { checks: "passing" },
  });
  expect(s.id).toBeGreaterThan(0);
  const got = getItem(db, item.id)!;
  expect(got.sources).toHaveLength(1);
  expect(got.sources[0].meta).toEqual({ checks: "passing" });
  expect(got.sources[0].repo).toBe("api");
});

it("updates a source state", () => {
  const item = createItem(db, { title: "x" });
  const s = addSource(db, item.id, { kind: "github_pr", externalId: "api#2" });
  const up = updateSource(db, s.id, { state: "merged" });
  expect(up.state).toBe("merged");
});

it("a partial updateSource preserves structural fields and updates pr-insight fields", () => {
  const item = createItem(db, { title: "x" });
  const s = addSource(db, item.id, {
    kind: "github_pr",
    externalId: "api#3",
    role: "stacked",
    targetBranch: "api#66682",
    mergeOrder: 3,
    title: "F8 empty-guard",
  });
  // sync-style: only state + pr-insight fields, no structural fields
  updateSource(db, s.id, { state: "merged", mergeable: "conflicting", commentsCount: 4, unresolvedThreads: 2 });
  const got = getItem(db, item.id)!.sources[0];
  expect(got.state).toBe("merged");
  expect(got.role).toBe("stacked");
  expect(got.targetBranch).toBe("api#66682");
  expect(got.mergeOrder).toBe(3);
  expect(got.title).toBe("F8 empty-guard");
  expect(got.mergeable).toBe("conflicting");
  expect(got.commentsCount).toBe(4);
  expect(got.unresolvedThreads).toBe(2);
});

it("manages checklist items with order + done", () => {
  const item = createItem(db, { title: "x" });
  const a = addChecklist(db, item.id, "fill vajra links", "alert-rules #22625");
  const b = addChecklist(db, item.id, "sign-off");
  expect(b.position).toBeGreaterThan(a.position);
  const done = setChecklistDone(db, a.id, true);
  expect(done.done).toBe(1);
  removeChecklist(db, b.id);
  expect(getItem(db, item.id)!.checklist).toHaveLength(1);
});
