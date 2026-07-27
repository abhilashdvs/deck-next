import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DrizzleDb } from "@/lib/db";
import { allGithubSources } from "@/lib/model/sources";
import { importSources } from "@/lib/model/import";
import type { ImportRecord, PrChecks } from "@/lib/types";
import { prUrlFor } from "@/lib/pr";

const execFileP = promisify(execFile);

export function normalizePr(d: {
  state?: string;
  isDraft?: boolean;
  mergedAt?: string | null;
  mergeable?: string;
  comments?: unknown[];
  reviews?: unknown[];
}): { state: string; mergeable: string | undefined; commentsCount: number } {
  const state = d.mergedAt
    ? "merged"
    : d.isDraft
      ? "draft"
      : (d.state ?? "").toUpperCase() === "CLOSED"
        ? "closed"
        : "open";
  const m = (d.mergeable ?? "").toUpperCase();
  const mergeable = m === "MERGEABLE" ? "mergeable" : m === "CONFLICTING" ? "conflicting" : undefined;
  const commentsCount =
    (Array.isArray(d.comments) ? d.comments.length : 0) +
    (Array.isArray(d.reviews) ? d.reviews.length : 0);
  return { state, mergeable, commentsCount };
}

// One node of `statusCheckRollup.contexts`. GitHub returns two shapes: CheckRun
// (Actions jobs) and StatusContext (commit statuses), each with its own name,
// state and url field.
export interface RollupNode {
  __typename?: string;
  name?: string;
  status?: string;
  conclusion?: string | null;
  detailsUrl?: string | null;
  context?: string;
  state?: string;
  targetUrl?: string | null;
  isRequired?: boolean;
}

const RUN_PASSING = new Set(["SUCCESS", "SKIPPED", "NEUTRAL"]);
const RUN_FAILING = new Set(["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]);

type CheckState = "passing" | "failing" | "pending";

function checkRunState(n: RollupNode): CheckState {
  // status wins over conclusion: an in-flight run can carry a stale conclusion.
  if ((n.status ?? "").toUpperCase() !== "COMPLETED") return "pending";
  const c = (n.conclusion ?? "").toUpperCase();
  if (RUN_PASSING.has(c)) return "passing";
  if (RUN_FAILING.has(c)) return "failing";
  return "pending";
}

function statusContextState(n: RollupNode): CheckState {
  const s = (n.state ?? "").toUpperCase();
  if (s === "SUCCESS") return "passing";
  if (s === "FAILURE" || s === "ERROR") return "failing";
  return "pending";
}

export function normalizeChecks(nodes: RollupNode[] | null | undefined): PrChecks {
  const out: PrChecks = { required: 0, passing: 0, failing: 0, pending: 0, failed: [] };
  for (const n of nodes ?? []) {
    if (n.isRequired !== true) continue;
    const isCtx = n.__typename === "StatusContext";
    const state = isCtx ? statusContextState(n) : checkRunState(n);
    out.required++;
    if (state === "failing") {
      out.failing++;
      out.failed.push({
        name: (isCtx ? n.context : n.name) ?? "unknown",
        url: (isCtx ? n.targetUrl : n.detailsUrl) ?? null,
      });
    } else if (state === "passing") {
      out.passing++;
    } else {
      out.pending++;
    }
  }
  return out;
}

// One GraphQL call per PR returning both unresolved review threads and the
// latest commit's required-check rollup. `isRequired` is the authoritative
// signal — the branch-protection REST endpoint needs admin and 404s here.
async function ghPrDetails(
  owner: string,
  repo: string,
  number: number,
): Promise<{ unresolvedThreads: number; checks: PrChecks | null }> {
  try {
    const query =
      "query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){" +
      "reviewThreads(first:100){nodes{isResolved}}" +
      "commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{__typename" +
      " ... on CheckRun{name status conclusion detailsUrl isRequired(pullRequestNumber:$n)}" +
      " ... on StatusContext{context state targetUrl isRequired(pullRequestNumber:$n)}" +
      "}}}}}}" +
      "}}}";
    const { stdout } = await execFileP("gh", [
      "api",
      "graphql",
      "-f",
      `query=${query}`,
      "-F",
      `o=${owner}`,
      "-F",
      `r=${repo}`,
      "-F",
      `n=${number}`,
    ]);
    const pr = JSON.parse(stdout)?.data?.repository?.pullRequest;
    const threads: { isResolved: boolean }[] = pr?.reviewThreads?.nodes ?? [];
    const nodes: RollupNode[] = pr?.commits?.nodes?.[0]?.commit?.statusCheckRollup?.contexts?.nodes ?? [];
    return {
      unresolvedThreads: threads.filter((t) => t.isResolved === false).length,
      checks: normalizeChecks(nodes),
    };
  } catch {
    return { unresolvedThreads: 0, checks: null };
  }
}

export async function syncGithub(
  db: DrizzleDb,
): Promise<{ synced: number; updated: number; results: { externalId: string; state: string }[] }> {
  const prs = allGithubSources(db);
  const records: ImportRecord[] = [];
  const results: { externalId: string; state: string }[] = [];

  await Promise.all(
    prs.map(async (p) => {
      if (!p.externalId) return;
      const url = p.url || (p.repo && p.number ? prUrlFor(p.repo, p.number) : "");
      if (!url) return;
      try {
        const { stdout } = await execFileP("gh", [
          "pr",
          "view",
          url,
          "--json",
          "state,isDraft,mergedAt,reviewDecision,mergeable,comments,reviews",
        ]);
        const d = JSON.parse(stdout);
        const n = normalizePr(d);
        const review = (d.reviewDecision ?? "").toLowerCase();
        const m = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(url);
        const { unresolvedThreads, checks } = m
          ? await ghPrDetails(m[1], m[2], Number(m[3]))
          : { unresolvedThreads: 0, checks: null };
        records.push({
          kind: "github_pr",
          externalId: p.externalId,
          repo: p.repo ?? undefined,
          number: p.number ?? undefined,
          url,
          state: n.state,
          mergeable: n.mergeable,
          commentsCount: n.commentsCount,
          unresolvedThreads,
          // Rebuilt wholesale each sync — updateSource writes meta as one blob,
          // so both keys must be spread or the other is silently dropped.
          meta: { ...(review ? { review } : {}), ...(checks ? { checks } : {}) },
        });
        results.push({ externalId: p.externalId, state: n.state });
      } catch {
        results.push({ externalId: p.externalId, state: "skipped" });
      }
    }),
  );

  const res = importSources(db, records);
  return { synced: records.length, updated: res.updated, results };
}
