import type { DrizzleDb } from "@/lib/db";
import { replaceMyPrs, type MyPrInput } from "@/lib/model/my-prs";
import { normalizeChecks, type RollupNode } from "@/lib/sync";
import type { PrChecks } from "@/lib/types";
import { ghCliClient, type GitHubClient, type SearchPr } from "@/lib/github-client";

function repoFromUrl(url: string): { owner: string; repo: string; number: number } | null {
  const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}

// Same GraphQL shape as lib/sync.ts's ghPrDetails, widened with reviewDecision
// and mergeable (search-prs doesn't expose them), duplicated here so the my-PRs
// sync doesn't reach across to the task-linked sync's internals.
async function ghMyPrDetails(
  client: GitHubClient,
  owner: string,
  repo: string,
  number: number,
): Promise<{ unresolvedThreads: number; checks: PrChecks | null; reviewDecision: string | null; mergeable: string | null }> {
  try {
    const query =
      "query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){" +
      "reviewDecision mergeable " +
      "reviewThreads(first:100){nodes{isResolved}}" +
      "commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{__typename" +
      " ... on CheckRun{name status conclusion detailsUrl isRequired(pullRequestNumber:$n)}" +
      " ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$n)}" +
      "}}}}}}" +
      "}}}";
    // Loosely typed on purpose: the shape mirrors the hand-written query and is
    // defended by the ?? [] fallbacks, exactly as the pre-client JSON.parse was.
    const data = (await client.graphql(query, { o: owner, r: repo, n: number })) as {
      repository?: {
        pullRequest?: {
          reviewDecision?: string | null;
          mergeable?: string | null;
          reviewThreads?: { nodes?: { isResolved: boolean }[] };
          commits?: { nodes?: { commit?: { statusCheckRollup?: { contexts?: { nodes?: RollupNode[] } } } }[] };
        };
      };
    };
    const pr = data?.repository?.pullRequest;
    const threads: { isResolved: boolean }[] = pr?.reviewThreads?.nodes ?? [];
    const nodes: RollupNode[] = (pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? []) as RollupNode[];
    const m = (pr?.mergeable ?? "").toUpperCase();
    return {
      unresolvedThreads: threads.filter((t) => t.isResolved === false).length,
      checks: normalizeChecks(nodes),
      reviewDecision: pr?.reviewDecision ? String(pr.reviewDecision).toLowerCase() : null,
      mergeable: m === "MERGEABLE" ? "mergeable" : m === "CONFLICTING" ? "conflicting" : null,
    };
  } catch {
    return { unresolvedThreads: 0, checks: null, reviewDecision: null, mergeable: null };
  }
}

export async function syncMyPrs(
  db: DrizzleDb,
  client: GitHubClient = ghCliClient(),
): Promise<{ synced: number; updated: number }> {
  const [authored, reviewing] = await Promise.all([
    client.searchMyPrs("author"),
    client.searchMyPrs("reviewer"),
  ]);

  // Dedupe by URL: a PR you authored that also requests your review appears in
  // both result sets. Author wins — you own the outcome.
  const byUrl = new Map<string, SearchPr & { role: "author" | "reviewer" }>();
  for (const pr of authored) byUrl.set(pr.url, { ...pr, role: "author" });
  for (const pr of reviewing) {
    if (!byUrl.has(pr.url)) byUrl.set(pr.url, { ...pr, role: "reviewer" });
  }

  const inputs: MyPrInput[] = [];
  await Promise.all(
    Array.from(byUrl.values()).map(async (pr) => {
      const ref = repoFromUrl(pr.url);
      const repo = pr.repo || ref?.repo || "";
      const number = pr.number ?? ref?.number ?? 0;
      if (!repo || !number) return;
      const details = ref
        ? await ghMyPrDetails(client, ref.owner, ref.repo, ref.number)
        : { unresolvedThreads: 0, checks: null, reviewDecision: null, mergeable: null };
      inputs.push({
        externalId: `${repo}#${number}`,
        repo,
        number,
        title: pr.title,
        url: pr.url,
        state: pr.isDraft ? "draft" : "open",
        isDraft: pr.isDraft,
        role: pr.role,
        reviewDecision: details.reviewDecision,
        mergeable: details.mergeable,
        commentsCount: pr.commentsCount ?? null,
        unresolvedThreads: details.unresolvedThreads,
        checks: details.checks,
        updatedAt: pr.updatedAt,
      });
    }),
  );

  replaceMyPrs(db, inputs);
  return { synced: inputs.length, updated: inputs.length };
}
