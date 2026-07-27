import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { _setTestDb } from "@/lib/api-db";
import { GET as itemsGET, POST as itemsPOST } from "@/app/api/items/route";
import { PATCH as itemPATCH } from "@/app/api/items/[id]/route";
import { POST as importPOST } from "@/app/api/import/route";
import { POST as syncPOST } from "@/app/api/sync/route";

beforeEach(() => {
  _setTestDb(getDb(":memory:"));
});

function req(url: string, init?: RequestInit): NextRequest {
  return new NextRequest(url, init);
}

const jsonBody = (obj: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(obj),
});

describe("api", () => {
  it("creates and lists items", async () => {
    const post = await itemsPOST(req("http://localhost/api/items", jsonBody({ title: "API item", type: "bug" })));
    expect(post.status).toBe(201);
    const list = await itemsGET(req("http://localhost/api/items"));
    const body = await list.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toBe("API item");
  });

  it("imports idempotently", async () => {
    const rec = [{ kind: "github_pr", externalId: "api#1", repo: "api", state: "open", item: { title: "Init", type: "feature" } }];
    await importPOST(req("http://localhost/api/import", jsonBody(rec)));
    await importPOST(req("http://localhost/api/import", jsonBody(rec)));
    const list = await (await itemsGET(req("http://localhost/api/items"))).json();
    expect(list).toHaveLength(1);
    expect(list[0].sources).toHaveLength(1);
  });

  it("patches item status", async () => {
    const created = await (await itemsPOST(req("http://localhost/api/items", jsonBody({ title: "x" })))).json();
    const patched = await itemPATCH(
      req(`http://localhost/api/items/${created.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "done" }) }),
      { params: Promise.resolve({ id: String(created.id) }) },
    );
    expect((await patched.json()).status).toBe("done");
  });

  it("sync with no PRs returns zeros", async () => {
    const res = await syncPOST();
    expect(await res.json()).toEqual({ synced: 0, updated: 0, results: [] });
  });
});
