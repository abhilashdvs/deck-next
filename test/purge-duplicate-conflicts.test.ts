import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { PURGE_SQL } from "../scripts/purge-duplicate-conflicts.mjs";

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );
  `);
});

function insert(itemId: number, type: string, summary: string, createdAt: string) {
  db.prepare("INSERT INTO activity (item_id, type, summary, data, created_at) VALUES (?, ?, ?, NULL, ?)").run(
    itemId,
    type,
    summary,
    createdAt,
  );
}

it("keeps only the newest pr_conflict row per item and summary", () => {
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-14T20:53:42.106Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-15T10:00:00.000Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-16T14:55:33.145Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3096", "2026-07-14T10:00:00.000Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3096", "2026-07-15T10:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT summary, created_at FROM activity ORDER BY summary").all() as {
    summary: string;
    created_at: string;
  }[];
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ summary: "Conflicts on magic-checkout-service #3096", created_at: "2026-07-15T10:00:00.000Z" });
  expect(rows[1]).toMatchObject({ summary: "Conflicts on magic-checkout-service #3189", created_at: "2026-07-16T14:55:33.145Z" });
});

it("leaves other activity types and single conflict rows untouched", () => {
  insert(1, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");
  insert(1, "status", "Moved to in_review", "2026-07-14T11:00:00.000Z");
  insert(1, "pr_merged", "Merged api #66682", "2026-07-14T12:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT type FROM activity ORDER BY id").all() as { type: string }[];
  expect(rows.map((r) => r.type)).toEqual(["pr_conflict", "status", "pr_merged"]);
});

it("keeps duplicate rows across different items separate", () => {
  insert(1, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");
  insert(2, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT item_id FROM activity").all() as { item_id: number }[];
  expect(rows).toHaveLength(2);
});
