import { describe, it, expect, beforeEach } from "vitest";
import { getDb, type DrizzleDb } from "@/lib/db";
import { createItem } from "@/lib/model/items";
import { addSource } from "@/lib/model/sources";
import { syncGithub } from "@/lib/sync";
import { getItem } from "@/lib/model/items";
import type { GitHubClient, PrViewData } from "@/lib/github-client";

let db: DrizzleDb;
beforeEach(() => {
  db = getDb(":memory:");
});

// A fake client that plays back canned data, so sync logic is tested without
// spawning gh or hitting the network.
function fakeClient(over: {
  prView?: PrViewData;
  review?: string | null;
  unresolvedThreads?: number;
  checks?: { required: number; passing: number; failing: number; pending: number; failed: never[] } | null;
}): GitHubClient {
  return {
    kind: "pat",
    async prView() {
      return over.prView ?? { state: "OPEN", isDraft: false, mergedAt: null, mergeable: "MERGEABLE", comments: [], reviews: [] };
    },
    async graphql() {
      return {
        repository: {
          pullRequest: {
            reviewDecision: over.review ?? null,
            reviewThreads: { nodes: Array.from({ length: over.unresolvedThreads ?? 0 }, () => ({ isResolved: false })) },
            commits: { nodes: [{ commit: { statusCheckRollup: { contexts: { nodes: [] } } } }] },
          },
        },
      };
    },
    async searchMyPrs() {
      return [];
    },
    async rest() {
      return {} as never;
    },
    async restText() {
      return "";
    },
    async restPost() {},
  };
}

describe("syncGithub through a client", () => {
  it("updates a PR's state and review from the client", async () => {
    const item = createItem(db, { title: "x" });
    addSource(db, item.id, {
      kind: "github_pr",
      externalId: "api#1",
      repo: "api",
      number: 1,
      url: "https://github.com/acme/api/pull/1",
    });
    const client = fakeClient({
      prView: { state: "OPEN", isDraft: false, mergedAt: null, mergeable: "CONFLICTING", comments: [], reviews: [] },
      review: "changes_requested",
      unresolvedThreads: 2,
    });
    const res = await syncGithub(db, client);
    expect(res.synced).toBe(1);
    const got = getItem(db, item.id)!;
    expect(got.sources[0].mergeable).toBe("conflicting");
    expect(got.sources[0].unresolvedThreads).toBe(2);
    expect((got.sources[0].meta as { review?: string }).review).toBe("changes_requested");
  });

  it("marks a PR merged when mergedAt is set", async () => {
    const item = createItem(db, { title: "x" });
    addSource(db, item.id, {
      kind: "github_pr",
      externalId: "api#1",
      repo: "api",
      number: 1,
      url: "https://github.com/acme/api/pull/1",
      state: "open",
    });
    const client = fakeClient({ prView: { state: "CLOSED", isDraft: false, mergedAt: "2026-07-18", mergeable: undefined, comments: [], reviews: [] } });
    await syncGithub(db, client);
    expect(getItem(db, item.id)!.sources[0].state).toBe("merged");
  });
});
