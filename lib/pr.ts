import type { LinkedSource, Status, SourceKind, PrChecks } from "@/lib/types";
import { defaultGithubOrg } from "@/lib/config";

// Builds a PR URL from repo + number using the configured org; empty string
// when no org is configured (full URLs are unaffected).
export function prUrlFor(repo: string, number: number): string {
  const org = defaultGithubOrg();
  return org ? `https://github.com/${org}/${repo}/pull/${number}` : "";
}

export interface ParsedSource {
  kind: SourceKind;
  repo?: string;
  number?: number;
  url: string;
  externalId?: string;
  title?: string;
}

// Turn pasted text into a source: a GitHub PR URL, a short `repo#123`, a Slack
// thread link, or any other URL. Returns null if it's not recognizable.
export function parseSource(input: string): ParsedSource | null {
  const s = input.trim();
  if (!s) return null;
  const gh = s.match(/github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/i);
  if (gh) {
    const repo = gh[1];
    const number = Number(gh[2]);
    return { kind: "github_pr", repo, number, url: s.split(/[?#]/)[0], externalId: `${repo}#${number}` };
  }
  const short = s.match(/^([\w.-]+)#(\d+)$/);
  if (short) {
    const repo = short[1];
    const number = Number(short[2]);
    return {
      kind: "github_pr",
      repo,
      number,
      url: prUrlFor(repo, number),
      externalId: `${repo}#${number}`,
    };
  }
  if (/slack\.com\//i.test(s)) return { kind: "slack", url: s, title: "Slack thread" };
  if (/^https?:\/\//i.test(s)) return { kind: "url", url: s };
  return null;
}

export const STATUS_COLOR: Record<Status, string> = {
  todo: "var(--st-todo)",
  in_progress: "var(--st-progress)",
  in_review: "var(--st-review)",
  blocked: "var(--st-blocked)",
  done: "var(--st-done)",
};

export function sourceUrl(s: Pick<LinkedSource, "url" | "kind" | "repo" | "number">): string {
  if (s.url) return s.url;
  if (s.kind === "github_pr" && s.repo && s.number) {
    return prUrlFor(s.repo, s.number);
  }
  return "";
}

export function isMergedState(state?: string | null): boolean {
  const s = (state ?? "").toLowerCase();
  return s === "merged" || s === "closed";
}

export function prProgress(sources: LinkedSource[]): {
  prs: LinkedSource[];
  merged: number;
  total: number;
  repoCount: number;
  hasStacked: boolean;
} {
  const prs = sources.filter((s) => s.kind === "github_pr");
  const merged = prs.filter((s) => isMergedState(s.state)).length;
  const repoCount = new Set(prs.map((s) => s.repo).filter(Boolean)).size;
  const hasStacked = sources.some((s) => s.role === "stacked");
  return { prs, merged, total: prs.length, repoCount, hasStacked };
}

export function hasConflict(sources: LinkedSource[]): boolean {
  return sources.some((s) => s.mergeable === "conflicting");
}

export function unresolvedCount(sources: LinkedSource[]): number {
  return sources.reduce((n, s) => n + (s.unresolvedThreads ?? 0), 0);
}

export function prChecks(s: Pick<LinkedSource, "meta">): PrChecks | null {
  const c = (s.meta as Record<string, unknown> | null)?.checks;
  return c && typeof c === "object" ? (c as PrChecks) : null;
}

// Merged and closed PRs are skipped everywhere checks are consumed — their
// required checks no longer gate anything.
function liveFailing(s: LinkedSource): number {
  if (isMergedState(s.state)) return 0;
  return prChecks(s)?.failing ?? 0;
}

export function checksFailingCount(sources: LinkedSource[]): number {
  return sources.reduce((n, s) => n + liveFailing(s), 0);
}

export function anyChecksFailing(sources: LinkedSource[]): boolean {
  return sources.some((s) => liveFailing(s) > 0);
}

export function linkLabel(s: LinkedSource): string {
  if (s.kind === "slack") return s.title || "Slack thread";
  if (s.kind === "devrev_issue" || s.kind === "devrev_ticket") return s.externalId || "DevRev";
  return s.title || s.url || "Link";
}
