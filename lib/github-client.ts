// Transport seam for talking to GitHub. Two implementations: the local `gh`
// CLI (zero-config default) and a Personal Access Token (works anywhere a
// browser can reach api.github.com — including a future hosted deployment).
// The sync logic is transport-agnostic; only these two functions change.

// The normalized shape both transports return for a "PR view" — mirrors the
// subset of `gh pr view --json` fields the sync consumes.
export interface PrViewData {
  state?: string;
  isDraft?: boolean;
  mergedAt?: string | null;
  reviewDecision?: string;
  mergeable?: string;
  comments?: unknown[];
  reviews?: unknown[];
}

// A PR returned by the "my open PRs" search, normalized across transports.
export interface SearchPr {
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: boolean;
  repo: string;
  updatedAt: string;
  commentsCount?: number;
}

export interface GitHubClient {
  graphql<T>(query: string, variables: Record<string, string | number>): Promise<T>;
  prView(owner: string, repo: string, number: number): Promise<PrViewData>;
  // Open PRs authored by / review-requested from the authenticated user.
  searchMyPrs(role: "author" | "reviewer"): Promise<SearchPr[]>;
  rest<T>(path: string, opts?: { maxBuffer?: number }): Promise<T>;
  // Raw text (job logs are plain text, not JSON). gh follows the redirect;
  // fetch does too.
  restText(path: string, opts?: { maxBuffer?: number }): Promise<string>;
  restPost(path: string): Promise<void>;
  kind: "gh" | "pat";
}

export function ghCliClient(): GitHubClient {
  // Lazy import so tests that never touch gh don't pay for the module.
  return {
    kind: "gh",
    async graphql<T>(query: string, variables: Record<string, string | number>): Promise<T> {
      const { ghJson } = await import("@/lib/gh");
      const args = ["api", "graphql", "-f", `query=${query}`];
      for (const [k, v] of Object.entries(variables)) {
        args.push("-F", `${k}=${v}`);
      }
      return ghJson<T>(args);
    },
    async prView(owner, repo, number) {
      const { ghJson } = await import("@/lib/gh");
      return ghJson<PrViewData>([
        "pr", "view", `https://github.com/${owner}/${repo}/pull/${number}`,
        "--json", "state,isDraft,mergedAt,reviewDecision,mergeable,comments,reviews",
      ]);
    },
    async searchMyPrs(role) {
      const { ghJson } = await import("@/lib/gh");
      const flag = role === "author" ? "--author=@me" : "--review-requested=@me";
      const rows = await ghJson<
        { number: number; title: string; url: string; state: string; isDraft: boolean; repository: { nameWithOwner: string }; updatedAt: string; commentsCount?: number }[]
      >([
        "search", "prs", flag, "--state=open", "--limit", "100",
        "--json", "number,title,url,state,isDraft,repository,updatedAt,commentsCount",
      ]);
      return rows.map((r) => ({
        number: r.number,
        title: r.title,
        url: r.url,
        state: r.state,
        isDraft: r.isDraft,
        repo: r.repository?.nameWithOwner?.split("/")[1] ?? "",
        updatedAt: r.updatedAt,
        commentsCount: r.commentsCount,
      }));
    },
    async rest<T>(path: string, opts?: { maxBuffer?: number }): Promise<T> {
      const { gh } = await import("@/lib/gh");
      const out = await gh(["api", path], opts);
      return JSON.parse(out) as T;
    },
    async restText(path: string, opts?: { maxBuffer?: number }): Promise<string> {
      const { gh } = await import("@/lib/gh");
      return gh(["api", path], opts);
    },
    async restPost(path: string): Promise<void> {
      const { gh } = await import("@/lib/gh");
      await gh(["api", "-X", "POST", path]);
    },
  };
}

const API = "https://api.github.com";

interface RestPr {
  state?: string;
  draft?: boolean;
  merged_at?: string | null;
  mergeable?: boolean | null;
}

export function patClient(token: string): GitHubClient {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    kind: "pat",
    async graphql<T>(query: string, variables: Record<string, string | number>): Promise<T> {
      const res = await fetch(`${API}/graphql`, {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });
      if (!res.ok) throw new Error(`github graphql ${res.status}`);
      const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
      if (json.errors?.length) throw new Error(json.errors[0].message);
      if (!json.data) throw new Error("github graphql: no data");
      return json.data;
    },
    // REST /pulls gives state/draft/merged_at; mergeable is a tri-state bool
    // there. Review decision isn't on the REST PR object at all — the sync's
    // GraphQL call carries it, so it's read from there downstream.
    async prView(owner, repo, number) {
      const pr = await this.rest<RestPr>(`repos/${owner}/${repo}/pulls/${number}`);
      const comments = await this.rest<unknown[]>(`repos/${owner}/${repo}/issues/${number}/comments`).catch(() => []);
      const reviews = await this.rest<unknown[]>(`repos/${owner}/${repo}/pulls/${number}/reviews`).catch(() => []);
      return {
        state: pr.state,
        isDraft: pr.draft,
        mergedAt: pr.merged_at ?? null,
        mergeable: pr.mergeable === true ? "MERGEABLE" : pr.mergeable === false ? "CONFLICTING" : undefined,
        comments,
        reviews,
      };
    },
    async rest<T>(path: string): Promise<T> {
      const res = await fetch(`${API}/${path}`, { headers: auth });
      if (!res.ok) throw new Error(`github rest ${res.status} ${path}`);
      return res.json() as Promise<T>;
    },
    async restText(path: string): Promise<string> {
      const res = await fetch(`${API}/${path}`, { headers: auth, redirect: "follow" });
      if (!res.ok) throw new Error(`github rest text ${res.status} ${path}`);
      return res.text();
    },
    async restPost(path: string): Promise<void> {
      const res = await fetch(`${API}/${path}`, { method: "POST", headers: auth });
      if (!res.ok) throw new Error(`github rest POST ${res.status} ${path}`);
    },
    async searchMyPrs(role) {
      // /search/issues is the REST search endpoint; it returns issues and PRs
      // together, so we filter to is:pr in the query. `draft` isn't a field
      // here — it's read from the URL's `pull/...` shape and the later
      // prView/GraphQL detail.
      const q = role === "author" ? "is:pr is:open author:@me" : "is:pr is:open review-requested:@me";
      const data = await this.rest<{ items: { number: number; title: string; html_url: string; state: string; draft?: boolean; updated_at: string; comments: number; repository_url: string }[] }>(
        `search/issues?q=${encodeURIComponent(q)}&per_page=100`,
      );
      return (data.items ?? []).map((it) => ({
        number: it.number,
        title: it.title,
        url: it.html_url,
        state: it.state,
        isDraft: it.draft ?? false,
        repo: it.repository_url.split("/repos/")[1]?.split("/")[1] ?? "",
        updatedAt: it.updated_at,
        commentsCount: it.comments,
      }));
    },
  };
}

export function resolveClient(token?: string | null): GitHubClient {
  return token ? patClient(token) : ghCliClient();
}
