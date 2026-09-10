import { describe, it, expect, beforeEach } from "vitest";
import { getDb } from "@/lib/db";
import { _setTestDb } from "@/lib/api-db";
import { upsertMyPr } from "@/lib/model/my-prs";
import { GET as myPrsGET } from "@/app/api/my-prs/route";

let db: ReturnType<typeof getDb>;
beforeEach(() => {
  db = getDb(":memory:");
  _setTestDb(db);
});

describe("GET /api/my-prs", () => {
  it("returns an empty array when nothing is synced", async () => {
    const res = await myPrsGET();
    expect(await res.json()).toEqual([]);
  });

  it("returns synced PRs newest first", async () => {
    upsertMyPr(db, {
      externalId: "api#1", repo: "api", number: 1, title: "older",
      url: "https://github.com/acme/api/pull/1", state: "open", role: "author",
      updatedAt: "2026-07-17T10:00:00Z",
    });
    upsertMyPr(db, {
      externalId: "api#2", repo: "api", number: 2, title: "newer",
      url: "https://github.com/acme/api/pull/2", state: "open", role: "author",
      updatedAt: "2026-07-18T10:00:00Z",
    });
    const res = await myPrsGET();
    const body = await res.json();
    expect(body.map((p: { externalId: string }) => p.externalId)).toEqual(["api#2", "api#1"]);
  });

  it("hydrates checks from JSON", async () => {
    upsertMyPr(db, {
      externalId: "api#1", repo: "api", number: 1, title: "x",
      url: "https://github.com/acme/api/pull/1", state: "open", role: "author",
      updatedAt: "2026-07-18T10:00:00Z",
      checks: { required: 3, passing: 1, failing: 2, pending: 0, failed: [] },
    });
    const res = await myPrsGET();
    const body = await res.json();
    expect(body[0].checks.failing).toBe(2);
  });
});
