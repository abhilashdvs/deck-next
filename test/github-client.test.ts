import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { patClient, ghCliClient, resolveClient } from "@/lib/github-client";

const realFetch = global.fetch;
beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  global.fetch = realFetch;
});

describe("resolveClient", () => {
  it("uses gh when no token is given", () => {
    expect(resolveClient(null).kind).toBe("gh");
    expect(resolveClient(undefined).kind).toBe("gh");
    expect(resolveClient("").kind).toBe("gh");
  });

  it("uses pat when a token is given", () => {
    expect(resolveClient("ghp_x").kind).toBe("pat");
  });
});

describe("patClient", () => {
  it("sends the bearer token on a REST GET", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ login: "me" }) }) as unknown as typeof fetch;
    const c = patClient("ghp_test");
    const out = await c.rest<{ login: string }>("user");
    expect(out.login).toBe("me");
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toBe("https://api.github.com/user");
    expect((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).headers).toMatchObject({
      Authorization: "Bearer ghp_test",
    });
  });

  it("throws on a non-ok REST response", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    await expect(patClient("bad").rest("user")).rejects.toThrow("401");
  });

  it("posts graphql with query and variables", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { viewer: { login: "me" } } }),
    }) as unknown as typeof fetch;
    const c = patClient("ghp_test");
    const out = await c.graphql<{ viewer: { login: string } }>("query{viewer{login}}", { n: 1 });
    expect(out.viewer.login).toBe("me");
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.query).toBe("query{viewer{login}}");
    expect(body.variables).toEqual({ n: 1 });
  });

  it("throws on graphql errors", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ errors: [{ message: "Bad credentials" }] }),
    }) as unknown as typeof fetch;
    await expect(patClient("bad").graphql("query{}", {})).rejects.toThrow("Bad credentials");
  });

  it("searchMyPrs builds the author query and maps repository_url to repo name", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            number: 42,
            title: "A PR",
            html_url: "https://github.com/acme/api/pull/42",
            state: "open",
            draft: false,
            updated_at: "2026-07-18T10:00:00Z",
            comments: 3,
            repository_url: "https://api.github.com/repos/acme/api",
          },
        ],
      }),
    }) as unknown as typeof fetch;
    const c = patClient("ghp_test");
    const prs = await c.searchMyPrs("author");
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({ number: 42, repo: "api", commentsCount: 3 });
    const url = String(vi.mocked(global.fetch).mock.calls[0][0]);
    expect(url).toContain("search/issues?q=");
    expect(decodeURIComponent(url)).toContain("author:@me");
  });
});

describe("ghCliClient", () => {
  it("reports its kind", () => {
    expect(ghCliClient().kind).toBe("gh");
  });
});
