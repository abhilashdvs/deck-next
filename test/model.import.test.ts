import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { importSources } from "@/lib/model/import";
import { listItems, getItem, updateItem } from "@/lib/model/items";
import { listActivity } from "@/lib/model/activity";
import type { ImportRecord } from "@/lib/types";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

const base = (over: Partial<ImportRecord> = {}): ImportRecord => ({
  kind: "github_pr",
  externalId: "api#66682",
  repo: "api",
  number: 66682,
  state: "open",
  role: "base",
  targetBranch: "master",
  item: { title: "1CC auth-configs decomp", type: "feature", priority: "p1" },
  ...over,
});

it("creates one item and is idempotent on re-import", () => {
  importSources(db, [base()]);
  importSources(db, [base()]);
  const items = listItems(db);
  expect(items).toHaveLength(1);
  expect(items[0].sources).toHaveLength(1);
});

it("collapses many PRs sharing an item title onto one item", () => {
  importSources(db, [
    base(),
    base({ externalId: "api#66725", number: 66725, role: "stacked", targetBranch: "api#66682", stackedOn: "api#66682" }),
    base({ externalId: "terminals#4444", repo: "terminals", number: 4444, role: "base" }),
  ]);
  const items = listItems(db);
  expect(items).toHaveLength(1);
  expect(items[0].sources).toHaveLength(3);
});

it("multi-PR aggregate status: all merged -> done", () => {
  importSources(db, [base({ state: "merged" }), base({ externalId: "api#66725", state: "merged" })]);
  expect(listItems(db)[0].status).toBe("done");
});

it("multi-PR aggregate status: an open non-review PR -> in_progress", () => {
  importSources(db, [
    base({ state: "draft" }),
    base({ externalId: "api#66725", state: "open", meta: { review: "review_required", checks: "passing" } }),
  ]);
  expect(listItems(db)[0].status).toBe("in_progress");
});

it("respects status_locked (manual status survives sync)", () => {
  importSources(db, [base()]);
  const id = listItems(db)[0].id;
  updateItem(db, id, { status: "blocked" }); // manual + locks
  importSources(db, [base({ state: "merged" })]);
  expect(getItem(db, id)!.status).toBe("blocked");
});

it("a state-only re-import preserves structural fields", () => {
  importSources(db, [base({ externalId: "api#66725", number: 66725, role: "stacked", targetBranch: "api#66682", stackedOn: "api#66682", mergeOrder: 3, title: "F8" })]);
  importSources(db, [{ kind: "github_pr", externalId: "api#66725", repo: "api", number: 66725, state: "merged", meta: {} }]);
  const src = listItems(db)[0].sources.find((s) => s.externalId === "api#66725")!;
  expect(src.state).toBe("merged");
  expect(src.role).toBe("stacked");
  expect(src.targetBranch).toBe("api#66682");
  expect(src.mergeOrder).toBe(3);
  expect(src.title).toBe("F8");
});

it("does not log a conflict when a merged PR's mergeable flips to conflicting", () => {
  importSources(db, [base()]);
  const id = listItems(db)[0].id;
  importSources(db, [base({ state: "merged", mergeable: "conflicting" })]);
  const conflicts = listActivity(db, id).filter((a) => a.type === "pr_conflict");
  expect(conflicts).toHaveLength(0);
});

it("still logs a conflict for a live (non-merged) PR", () => {
  importSources(db, [base()]);
  const id = listItems(db)[0].id;
  importSources(db, [base({ state: "open", mergeable: "conflicting" })]);
  const conflicts = listActivity(db, id).filter((a) => a.type === "pr_conflict");
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].summary).toBe("Conflicts on api #66682");
});
