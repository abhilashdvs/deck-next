import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { workItems } from "@/lib/schema";

describe("getDb", () => {
  it("creates tables and round-trips an insert", () => {
    const db = getDb(":memory:");
    db.insert(workItems).values({ title: "x", createdAt: "t", updatedAt: "t" }).run();
    const rows = db.select().from(workItems).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("x");
  });
});
