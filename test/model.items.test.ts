import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import {
  createItem,
  getItem,
  listItems,
  updateItem,
  deleteItem,
  reorderItems,
} from "@/lib/model/items";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

describe("item CRUD", () => {
  it("creates with defaults and reads back", () => {
    const it0 = createItem(db, { title: "Fix bug" });
    expect(it0.id).toBeGreaterThan(0);
    expect(it0.type).toBe("task");
    expect(it0.status).toBe("todo");
    expect(it0.tags).toEqual([]);
    const got = getItem(db, it0.id)!;
    expect(got.title).toBe("Fix bug");
    expect(got.sources).toEqual([]);
    expect(got.checklist).toEqual([]);
  });

  it("manual status change locks status", () => {
    const it0 = createItem(db, { title: "x" });
    const up = updateItem(db, it0.id, { status: "in_progress" });
    expect(up.status).toBe("in_progress");
    expect(up.statusLocked).toBe(1);
  });

  it("sync-style update does not lock", () => {
    const it0 = createItem(db, { title: "x" });
    const up = updateItem(db, it0.id, { status: "in_review", lockStatus: false });
    expect(up.statusLocked).toBe(0);
  });

  it("filters by status and free text", () => {
    createItem(db, { title: "alpha", status: "todo" });
    createItem(db, { title: "beta", status: "done" });
    expect(listItems(db, { status: "done" }).map((i) => i.title)).toEqual(["beta"]);
    expect(listItems(db, { q: "alph" }).map((i) => i.title)).toEqual(["alpha"]);
  });

  it("deletes", () => {
    const it0 = createItem(db, { title: "x" });
    deleteItem(db, it0.id);
    expect(getItem(db, it0.id)).toBeNull();
  });

  it("reorder persists a manual drag order (position wins over updatedAt)", () => {
    const a = createItem(db, { title: "a", status: "todo" });
    const b = createItem(db, { title: "b", status: "todo" });
    const c = createItem(db, { title: "c", status: "todo" });
    reorderItems(db, [c.id, a.id, b.id]);
    expect(listItems(db, { status: "todo" }).map((i) => i.title)).toEqual(["c", "a", "b"]);
  });
});
