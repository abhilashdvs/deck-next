# Required-Checks Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For each linked PR, track the GitHub status checks marked required-for-merge and surface how many failed and which ones failed.

**Architecture:** Widen the single existing per-PR `gh api graphql` call in `lib/sync.ts` to also return the latest commit's `statusCheckRollup` contexts with `isRequired`. A pure `normalizeChecks()` folds those into a `PrChecks` value stored at `linked_sources.meta.checks` (no schema migration). Pure helpers in `lib/pr.ts` feed three consumers: the needs-attention heuristic, the computed status, and two render sites.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Drizzle ORM + better-sqlite3, Vitest + @testing-library/react, `gh` CLI 2.86.0.

**Spec:** `docs/superpowers/specs/2026-07-16-required-checks-tracking-design.md` — read it before starting. The §2 subsection "`required` counts checks that have REPORTED" is load-bearing and non-obvious.

## Global Constraints

- **NEVER commit. NEVER stage.** Leave every edit unstaged in the working tree for the developer to review manually. This overrides the commit steps that normally end a TDD cycle. Do not run `git add`, `git commit`, `git push`, or `git checkout -b`.
- **Working directory:** `/Users/dontula.abhilash/Documents/onlymagic/deck-next`. Bash `cd` throws `GVM_ROOT not set` in this workspace — use a subshell `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; <cmd> )` or `npm --prefix /Users/dontula.abhilash/Documents/onlymagic/deck-next`.
- **`PrChecks.required` counts required checks that have REPORTED**, not those configured on the base branch. Never render a denominator (`2/9`) anywhere — see spec §2.
- **Never de-duplicate `failed[]` by name.** Two required checks legitimately share a name (`Lint` ×2 on `magic-onboarding#147`) with different URLs. React keys must be the array index.
- **Only required checks.** Never fall back to non-required checks when `required === 0`.
- camelCase end-to-end. Match surrounding comment density and idiom — comments only for constraints the code cannot show.
- Test command: `npx vitest run <file>`. Full suite: `npm test`.

---

### Task 1: `PrChecks` type + pure `normalizeChecks`

The whole feature's correctness lives here. No I/O — directly unit-testable.

**Files:**
- Modify: `lib/types.ts` (append after the `LinkedSource` interface, ~line 52)
- Modify: `lib/sync.ts` (add `RollupNode` type + `normalizeChecks` after `normalizePr`, ~line 31)
- Test: `test/sync.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PrChecks` from `@/lib/types` — `{ required: number; passing: number; failing: number; pending: number; failed: { name: string; url: string | null }[] }`
  - `normalizeChecks(nodes: RollupNode[] | null | undefined): PrChecks` from `@/lib/sync`
  - `RollupNode` from `@/lib/sync` (exported for tests)

- [ ] **Step 1: Write the failing tests**

Append to `test/sync.test.ts`. Update the existing import on line 2 to `import { normalizePr, normalizeChecks } from "@/lib/sync";`:

```ts
describe("normalizeChecks", () => {
  const run = (o: Record<string, unknown> = {}) => ({
    __typename: "CheckRun",
    name: "Lint",
    status: "COMPLETED",
    conclusion: "SUCCESS",
    detailsUrl: "https://ci/1",
    isRequired: true,
    ...o,
  });
  const ctx = (o: Record<string, unknown> = {}) => ({
    __typename: "StatusContext",
    context: "quality-gate-slit",
    state: "SUCCESS",
    targetUrl: "https://ci/2",
    isRequired: true,
    ...o,
  });

  it("counts required CheckRun and StatusContext nodes together", () => {
    expect(normalizeChecks([run(), ctx()])).toMatchObject({
      required: 2,
      passing: 2,
      failing: 0,
      pending: 0,
    });
  });

  it("ignores non-required nodes entirely, even failing ones", () => {
    const r = normalizeChecks([run({ isRequired: false, conclusion: "FAILURE" }), run()]);
    expect(r).toMatchObject({ required: 1, passing: 1, failing: 0 });
    expect(r.failed).toEqual([]);
  });

  it("treats SKIPPED and NEUTRAL as passing", () => {
    expect(normalizeChecks([run({ conclusion: "SKIPPED" }), run({ conclusion: "NEUTRAL" })])).toMatchObject({
      passing: 2,
      failing: 0,
    });
  });

  it("maps every CheckRun failure conclusion to failing", () => {
    for (const c of ["FAILURE", "TIMED_OUT", "CANCELLED", "ACTION_REQUIRED", "STARTUP_FAILURE"]) {
      expect(normalizeChecks([run({ conclusion: c })]).failing).toBe(1);
    }
  });

  it("records name and url for a failing CheckRun", () => {
    const r = normalizeChecks([run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/x" })]);
    expect(r.failed).toEqual([{ name: "Lint", url: "https://ci/x" }]);
  });

  it("maps StatusContext FAILURE and ERROR to failing with context + targetUrl", () => {
    const r = normalizeChecks([ctx({ state: "FAILURE", context: "quality-gate-ut", targetUrl: "https://ci/u" })]);
    expect(r).toMatchObject({ failing: 1 });
    expect(r.failed).toEqual([{ name: "quality-gate-ut", url: "https://ci/u" }]);
    expect(normalizeChecks([ctx({ state: "ERROR" })]).failing).toBe(1);
  });

  it("treats an in-flight CheckRun as pending even with a stale conclusion", () => {
    expect(normalizeChecks([run({ status: "IN_PROGRESS", conclusion: "SUCCESS" })])).toMatchObject({
      pending: 1,
      passing: 0,
      failing: 0,
    });
  });

  it("treats StatusContext PENDING and EXPECTED as pending", () => {
    expect(normalizeChecks([ctx({ state: "PENDING" }), ctx({ state: "EXPECTED" })])).toMatchObject({
      pending: 2,
    });
  });

  it("returns a zero value for an empty or missing rollup", () => {
    const zero = { required: 0, passing: 0, failing: 0, pending: 0, failed: [] };
    expect(normalizeChecks([])).toEqual(zero);
    expect(normalizeChecks(undefined)).toEqual(zero);
    expect(normalizeChecks(null)).toEqual(zero);
  });

  it("keeps both failures when two required checks share a name", () => {
    const r = normalizeChecks([
      run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/a" }),
      run({ conclusion: "FAILURE", name: "Lint", detailsUrl: "https://ci/b" }),
    ]);
    expect(r.failing).toBe(2);
    expect(r.failed).toEqual([
      { name: "Lint", url: "https://ci/a" },
      { name: "Lint", url: "https://ci/b" },
    ]);
  });

  it("defaults a missing url to null", () => {
    const r = normalizeChecks([run({ conclusion: "FAILURE", detailsUrl: null })]);
    expect(r.failed).toEqual([{ name: "Lint", url: null }]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/sync.test.ts )`

Expected: FAIL — `normalizeChecks is not a function` / no exported member `normalizeChecks`.

- [ ] **Step 3: Add the `PrChecks` type**

In `lib/types.ts`, append directly after the `LinkedSource` interface (after line 52):

```ts
// Required checks that have REPORTED on the latest commit — not the total
// configured on the base branch. A required check that never ran is absent from
// GitHub's rollup and cannot be counted, which is why no surface renders a
// denominator.
export interface PrChecks {
  required: number;
  passing: number;
  failing: number;
  pending: number;
  failed: { name: string; url: string | null }[];
}
```

- [ ] **Step 4: Implement `normalizeChecks`**

In `lib/sync.ts`, change the type import on line 6 to:

```ts
import type { ImportRecord, PrChecks } from "@/lib/types";
```

Then insert after `normalizePr` (after line 31):

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/sync.test.ts )`

Expected: PASS — all `normalizePr` and `normalizeChecks` tests green.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/types.ts lib/sync.ts test/sync.test.ts )`

Expected: all three show as modified (` M`) and **unstaged**. Do NOT commit.

---

### Task 2: Widen the GraphQL query and write `meta.checks`

**Files:**
- Modify: `lib/sync.ts` — replace `ghUnresolvedThreads` (lines 33-56) and update `syncGithub` (lines 79-93)

**Interfaces:**
- Consumes: `normalizeChecks`, `RollupNode`, `PrChecks` (Task 1).
- Produces: `linked_sources.meta.checks` populated as a `PrChecks` object on every synced GitHub PR. No new exports.

**No unit test:** this function shells out to `gh` and is not unit-testable without mocking `execFile`, which the existing suite does not do (`sync.test.ts` only covers the pure `normalizePr`). Its correctness is covered by Task 1's tests plus the live verification in Task 7. Do not add a mock-heavy test that asserts the query string.

- [ ] **Step 1: Replace `ghUnresolvedThreads` with `ghPrDetails`**

In `lib/sync.ts`, replace the entire `ghUnresolvedThreads` function (lines 33-56) with:

```ts
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
```

- [ ] **Step 2: Wire it into `syncGithub`**

In `syncGithub`, replace lines 79-93 (from `const review = ...` through the `records.push({...})` call) with:

```ts
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
```

- [ ] **Step 3: Verify the whole suite still passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test )`

Expected: PASS — no regressions. Nothing yet reads `meta.checks`.

- [ ] **Step 4: Verify types compile**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no errors.

- [ ] **Step 5: Prove the sync writes real check data**

Start the dev server if not running, then trigger a sync and inspect the DB:

```bash
( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; \
  curl -s -X POST http://localhost:3000/api/sync > /dev/null; \
  sqlite3 deck.db "SELECT repo || '#' || number, json_extract(meta,'\$.checks.required'), json_extract(meta,'\$.checks.failing') FROM linked_sources WHERE kind='github_pr' AND meta LIKE '%checks%' LIMIT 10;" )
```

Expected: rows with non-null required/failing counts, e.g. `magic-onboarding#147|9|4`. If every `required` is 0, stop — the query or the `isRequired` filter is wrong.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/sync.ts )`

Expected: ` M lib/sync.ts`, unstaged. Do NOT commit.

---

### Task 3: `lib/pr.ts` helpers

**Files:**
- Modify: `lib/pr.ts` (append after `unresolvedCount`, ~line 81)
- Test: `test/pr-sources.test.ts` (append a new `describe` block)

**Interfaces:**
- Consumes: `PrChecks` (Task 1), existing `isMergedState` from `@/lib/pr`.
- Produces, all from `@/lib/pr`:
  - `prChecks(s: LinkedSource): PrChecks | null`
  - `checksFailingCount(sources: LinkedSource[]): number`
  - `anyChecksFailing(sources: LinkedSource[]): boolean`

**Spec clarification applied here:** the spec suppresses the *badge* on merged/closed PRs but did not say so for attention. These helpers therefore **ignore merged and closed sources**. Without this, a multi-PR item where one PR merged with stale failing checks would raise attention forever. Checks on a merged PR are moot; this keeps attention, the card icon and the badge consistent.

- [ ] **Step 1: Write the failing tests**

Append to `test/pr-sources.test.ts`. Add to the imports at the top:

```ts
import { prChecks, checksFailingCount, anyChecksFailing } from "@/lib/pr";
import type { LinkedSource, PrChecks } from "@/lib/types";
```

Then append:

```ts
describe("check helpers", () => {
  const checks = (o: Partial<PrChecks> = {}): PrChecks => ({
    required: 3,
    passing: 3,
    failing: 0,
    pending: 0,
    failed: [],
    ...o,
  });
  const src = (o: Partial<LinkedSource> = {}): LinkedSource =>
    ({ id: 1, itemId: 1, kind: "github_pr", state: "open", meta: null, ...o }) as LinkedSource;

  it("reads a PrChecks object out of meta", () => {
    expect(prChecks(src({ meta: { checks: checks() } }))?.required).toBe(3);
  });

  it("returns null when meta has no checks", () => {
    expect(prChecks(src())).toBeNull();
    expect(prChecks(src({ meta: { review: "approved" } }))).toBeNull();
  });

  it("sums failing counts across PRs", () => {
    const sources = [
      src({ meta: { checks: checks({ failing: 2 }) } }),
      src({ meta: { checks: checks({ failing: 1 }) } }),
      src({ meta: { checks: checks() } }),
    ];
    expect(checksFailingCount(sources)).toBe(3);
    expect(anyChecksFailing(sources)).toBe(true);
  });

  it("is quiet when nothing is failing", () => {
    expect(anyChecksFailing([src({ meta: { checks: checks() } })])).toBe(false);
    expect(checksFailingCount([src()])).toBe(0);
  });

  it("ignores failing checks on merged and closed PRs", () => {
    const merged = src({ state: "merged", meta: { checks: checks({ failing: 4 }) } });
    const closed = src({ state: "closed", meta: { checks: checks({ failing: 2 }) } });
    expect(anyChecksFailing([merged, closed])).toBe(false);
    expect(checksFailingCount([merged, closed])).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-sources.test.ts )`

Expected: FAIL — no exported member `prChecks`.

- [ ] **Step 3: Implement the helpers**

In `lib/pr.ts`, change the type import on line 1 to:

```ts
import type { LinkedSource, Status, SourceKind, PrChecks } from "@/lib/types";
```

Append after `unresolvedCount` (after line 81):

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-sources.test.ts )`

Expected: PASS.

- [ ] **Step 5: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/pr.ts test/pr-sources.test.ts )`

Expected: both modified, unstaged. Do NOT commit.

---

### Task 4: Wire `attention.ts` and `status.ts`

**Files:**
- Modify: `lib/attention.ts` (add import + one clause after line 11)
- Modify: `lib/model/status.ts` (rewrite `prInReview`, lines 19-25)
- Test: `test/model.phase3.test.ts` (append to the existing `attentionReason` describe)
- Test: Create `test/model.status.test.ts`

**Interfaces:**
- Consumes: `prChecks`, `anyChecksFailing` (Task 3).
- Produces: `attentionReason` returns the new string `"Required checks failing"`. No new exports.

- [ ] **Step 1: Write the failing attention test**

Append inside the existing `describe("attentionReason", ...)` block in `test/model.phase3.test.ts` (the `base` helper is already defined there — reuse it, do not redefine it):

```ts
  it("flags an item whose PR has failing required checks", () => {
    const item = base({
      status: "in_progress",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 9, passing: 5, failing: 4, pending: 0, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBe("Required checks failing");
  });

  it("stays quiet when required checks are only pending", () => {
    const item = base({
      status: "in_progress",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 3, passing: 1, failing: 0, pending: 2, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBeNull();
  });

  it("stays quiet about failing checks on a done item", () => {
    const item = base({
      status: "done",
      updatedAt: new Date().toISOString(),
      sources: [
        {
          id: 1,
          itemId: 1,
          kind: "github_pr",
          state: "open",
          meta: { checks: { required: 3, passing: 0, failing: 3, pending: 0, failed: [] } },
        },
      ] as ItemDetail["sources"],
    });
    expect(attentionReason(item, Date.now())).toBeNull();
  });
```

- [ ] **Step 2: Write the failing status test**

Create `test/model.status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStatus } from "@/lib/model/status";
import type { WorkItem, LinkedSource, PrChecks } from "@/lib/types";

const item = (o: Partial<WorkItem> = {}): WorkItem =>
  ({ id: 1, title: "t", type: "task", status: "todo", statusLocked: 0, ...o }) as WorkItem;

const pr = (o: Partial<LinkedSource> = {}): LinkedSource =>
  ({ id: 1, itemId: 1, kind: "github_pr", state: "open", meta: null, ...o }) as LinkedSource;

const checks = (o: Partial<PrChecks> = {}): PrChecks => ({
  required: 3,
  passing: 3,
  failing: 0,
  pending: 0,
  failed: [],
  ...o,
});

describe("computeStatus with required checks", () => {
  it("keeps a multi-PR item out of in_review when a required check is failing", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks({ failing: 2, passing: 1 }) } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_progress");
  });

  it("allows in_review when required checks are passing", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks() } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_review");
  });

  it("allows in_review when required checks are only pending", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks({ passing: 1, pending: 2 }) } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_review");
  });

  it("allows in_review when a PR has no check data at all", () => {
    expect(computeStatus(item(), [pr({ id: 1 }), pr({ id: 2 })], [])).toBe("in_review");
  });
});
```

- [ ] **Step 3: Run both tests to verify they fail**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/model.phase3.test.ts test/model.status.test.ts )`

Expected: FAIL — attention returns `null` instead of `"Required checks failing"`; `computeStatus` returns `in_review` instead of `in_progress` for the failing case.

- [ ] **Step 4: Add the attention clause**

In `lib/attention.ts`, add the import after line 1:

```ts
import { anyChecksFailing } from "@/lib/pr";
```

Then insert immediately after the conflicts clause (line 11):

```ts
  if (anyChecksFailing(item.sources ?? [])) return "Required checks failing";
```

Update the block comment above `attentionReason` to name the new trigger:

```ts
// Computed "needs attention" heuristic — no scheduler. A task needs attention
// when a PR is conflicting, a required check is failing, it's been blocked over
// a week, or awaiting review for 3+ days. Snoozed items (snoozed_until in the
// future) are always quiet.
```

- [ ] **Step 5: Rewrite `prInReview`**

In `lib/model/status.ts`, add the import after line 1:

```ts
import { prChecks } from "@/lib/pr";
```

Replace `prInReview` (lines 19-25) with:

```ts
function prInReview(src: LinkedSource): boolean {
  const meta = (src.meta ?? {}) as Record<string, unknown>;
  const review = String(meta.review ?? "").toLowerCase();
  const checks = prChecks(src);
  // Pending checks don't disqualify: a PR waiting on CI is still in review.
  const checksOk = !checks || checks.failing === 0;
  return checksOk && review !== "changes_requested";
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/model.phase3.test.ts test/model.status.test.ts )`

Expected: PASS.

- [ ] **Step 7: Run the full suite for regressions**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test )`

Expected: PASS. `lib/model/status.ts` now imports from `lib/pr.ts`; confirm no circular-import error (`lib/pr.ts` imports only from `lib/types.ts`, so there is no cycle).

- [ ] **Step 8: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/attention.ts lib/model/status.ts test/ )`

Expected: modified + one untracked `test/model.status.test.ts`, all unstaged. Do NOT commit.

---

### Task 5: PR row badge + failing-check links

**Files:**
- Modify: `components/detail/pr-row.tsx` (whole file restructure)
- Test: `test/pr-row.test.tsx` (append)

**Interfaces:**
- Consumes: `prChecks` (Task 3), `isMergedState`, `sourceUrl` (existing), `PrChecks` (Task 1).
- Produces: `PrRow` renders a checks badge + failing chips. Export signature unchanged: `PrRow({ src }: { src: LinkedSource })`.

**Two constraints from the spec:** (1) `PrRow` currently returns one `<a>` wrapping everything — nesting per-check `<a>` chips inside is invalid HTML, so the failing chips must be a **sibling** of that anchor, not a child. (2) React keys must be the array index, since check names repeat.

- [ ] **Step 1: Write the failing tests**

Append to `test/pr-row.test.tsx` (the `src` helper is already defined at the top — reuse it):

```ts
const checks = (o = {}) => ({ required: 9, passing: 9, failing: 0, pending: 0, failed: [], ...o });

describe("PrRow required checks", () => {
  it("shows a failing badge and links each failing check", () => {
    render(
      <PrRow
        src={src({
          meta: {
            checks: checks({
              passing: 5,
              failing: 2,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "quality-gate-slit", url: "https://ci/b" },
              ],
            }),
          },
        })}
      />,
    );
    expect(screen.getByText("✗ 2 required failing")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /quality-gate-slit/ })).toHaveAttribute("href", "https://ci/b");
  });

  it("renders both chips when two failing checks share a name", () => {
    render(
      <PrRow
        src={src({
          meta: {
            checks: checks({
              passing: 7,
              failing: 2,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "Lint", url: "https://ci/b" },
              ],
            }),
          },
        })}
      />,
    );
    const links = screen.getAllByRole("link", { name: /Lint/ });
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["https://ci/a", "https://ci/b"]);
  });

  it("shows a pending badge when nothing is failing yet", () => {
    render(<PrRow src={src({ meta: { checks: checks({ passing: 1, pending: 2 }) } })} />);
    expect(screen.getByText("⋯ 2 required pending")).toBeInTheDocument();
  });

  it("shows a passing badge with no denominator", () => {
    render(<PrRow src={src({ meta: { checks: checks() } })} />);
    expect(screen.getByText("✓ required passing")).toBeInTheDocument();
    expect(screen.queryByText(/9\/9/)).not.toBeInTheDocument();
  });

  it("shows no checks badge when no required checks reported", () => {
    render(<PrRow src={src({ meta: { checks: checks({ required: 0, passing: 0 }) } })} />);
    expect(screen.queryByText(/required/)).not.toBeInTheDocument();
  });

  it("suppresses the checks badge on a merged PR", () => {
    render(
      <PrRow
        src={src({
          state: "merged",
          meta: { checks: checks({ failing: 3, failed: [{ name: "Lint", url: "https://ci/a" }] }) },
        })}
      />,
    );
    expect(screen.queryByText(/required failing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Lint/ })).not.toBeInTheDocument();
  });

  it("renders a failing check without a url as plain text", () => {
    render(
      <PrRow src={src({ meta: { checks: checks({ failing: 1, failed: [{ name: "BVT", url: null }] }) } })} />,
    );
    expect(screen.getByText("✗ BVT")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /BVT/ })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-row.test.tsx )`

Expected: FAIL — `Unable to find an element with the text: ✗ 2 required failing`.

- [ ] **Step 3: Rewrite `components/detail/pr-row.tsx`**

Replace the whole file with:

```tsx
"use client";

import type { LinkedSource, PrChecks } from "@/lib/types";
import { sourceUrl, isMergedState, prChecks } from "@/lib/pr";

const TAG_CLS: Record<string, string> = {
  ok: "text-st-done bg-st-done/15",
  rev: "text-st-review bg-st-review/15",
  crit: "text-st-blocked bg-st-blocked/15",
  merged: "text-st-done bg-st-done/15",
  neutral: "text-muted-foreground bg-foreground/[0.07] border border-hairline",
};

// Checks on a merged or closed PR no longer gate anything, so they're hidden.
function liveChecks(src: LinkedSource): PrChecks | null {
  if (isMergedState(src.state)) return null;
  const c = prChecks(src);
  return c && c.required > 0 ? c : null;
}

// No denominator: `required` only counts checks that have reported, so "2/9"
// would imply a completeness the data can't support.
function checksTag(src: LinkedSource): { t: string; cls: keyof typeof TAG_CLS } | null {
  const c = liveChecks(src);
  if (!c) return null;
  if (c.failing > 0) return { t: `✗ ${c.failing} required failing`, cls: "crit" };
  if (c.pending > 0) return { t: `⋯ ${c.pending} required pending`, cls: "rev" };
  return { t: "✓ required passing", cls: "ok" };
}

function stateTags(src: LinkedSource): { t: string; cls: keyof typeof TAG_CLS }[] {
  const tags: { t: string; cls: keyof typeof TAG_CLS }[] = [];
  const state = (src.state ?? "").toLowerCase();
  let hasPrimary = false;

  if (state === "merged") {
    tags.push({ t: "merged", cls: "merged" });
    hasPrimary = true;
  } else if (state === "closed") {
    tags.push({ t: "closed", cls: "neutral" });
    hasPrimary = true;
  }
  if (src.mergeable === "conflicting") {
    tags.push({ t: "conflicts", cls: "crit" });
    hasPrimary = true;
  }
  const ct = checksTag(src);
  if (ct) {
    tags.push(ct);
    hasPrimary = true;
  }
  const meta = (src.meta ?? {}) as Record<string, unknown>;
  const rv = String(meta.review ?? "").toLowerCase();
  if (rv.includes("approv")) {
    tags.push({ t: "✓ approved", cls: "ok" });
    hasPrimary = true;
  } else if (rv.includes("chang")) {
    tags.push({ t: "changes requested", cls: "crit" });
    hasPrimary = true;
  } else if (rv.includes("requir")) {
    tags.push({ t: "⧗ review", cls: "rev" });
    hasPrimary = true;
  }
  if (!hasPrimary) tags.push({ t: state === "draft" ? "draft" : "open", cls: "neutral" });

  if ((src.unresolvedThreads ?? 0) > 0) {
    tags.push({ t: `${src.unresolvedThreads} unresolved`, cls: "rev" });
  }
  return tags;
}

const CHIP = "rounded-md bg-st-blocked/15 px-1.5 py-0.5 font-mono text-[10px] text-st-blocked";

export function PrRow({ src }: { src: LinkedSource }) {
  const url = sourceUrl(src);
  const st = (src.state ?? "").toLowerCase();
  const pip = isMergedState(src.state)
    ? "var(--st-done)"
    : st === "draft"
      ? "var(--text-faint)"
      : "var(--st-progress)";
  const idText = src.repo ? `${src.repo}${src.number ? ` #${src.number}` : ""}` : src.externalId || src.kind;
  const tags = stateTags(src);
  const failed = liveChecks(src)?.failed ?? [];

  const Wrapper = url ? "a" : "div";
  return (
    <div>
      <Wrapper
        {...(url ? { href: url, target: "_blank", rel: "noreferrer" } : {})}
        className={`flex gap-3 rounded-[10px] border border-hairline bg-card p-2.5 ${url ? "cursor-pointer transition hover:bg-card-hover" : ""}`}
      >
        {src.mergeOrder != null && (
          <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline text-[10.5px] text-muted-foreground">
            {src.mergeOrder}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: pip }} />
            <span className="font-mono text-[12px] text-foreground">{idText}</span>
            {src.targetBranch && (
              <span className="ml-auto shrink-0 font-mono text-[10.5px] text-text-faint">→ {src.targetBranch}</span>
            )}
          </div>
          {src.title && <div className="mt-1 truncate text-[11.5px] text-muted-foreground">{src.title}</div>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {tags.map((tag, i) => (
              <span key={i} className={`rounded-md px-1.5 py-0.5 text-[10px] ${TAG_CLS[tag.cls]}`}>
                {tag.t}
              </span>
            ))}
          </div>
        </div>
      </Wrapper>
      {/* Sibling of the anchor above, not a child: nesting <a> inside <a> is
          invalid and browsers re-parent it. Keyed by index — names repeat. */}
      {failed.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 pl-2.5">
          {failed.map((f, i) =>
            f.url ? (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className={`${CHIP} transition hover:bg-st-blocked/25`}
              >
                ✗ {f.name}
              </a>
            ) : (
              <span key={i} className={CHIP}>
                ✗ {f.name}
              </span>
            ),
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-row.test.tsx )`

Expected: PASS — new tests plus all five pre-existing `PrRow` tests.

- [ ] **Step 5: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/pr-row.tsx test/pr-row.test.tsx )`

Expected: both modified, unstaged. Do NOT commit.

---

### Task 6: Card failing-checks icon

**Files:**
- Modify: `components/board/card.tsx` (import line 13, add `checksFailingCount` call ~line 77, add icon ~line 90)
- Test: `test/card.test.tsx` (append)

**Interfaces:**
- Consumes: `checksFailingCount` (Task 3).
- Produces: nothing new exported.

- [ ] **Step 1: Write the failing test**

Append to `test/card.test.tsx` (the `item` and `src` helpers are already defined at the top — reuse them):

```ts
describe("Card required checks", () => {
  it("shows a failing-checks icon when a PR has failing required checks", () => {
    render(
      <Card
        item={item({
          sources: [
            src({
              state: "open",
              meta: { checks: { required: 9, passing: 5, failing: 4, pending: 0, failed: [] } },
            }),
          ],
        })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByLabelText("4 required checks failing")).toBeInTheDocument();
  });

  it("shows no failing-checks icon when checks pass", () => {
    render(
      <Card
        item={item({
          sources: [
            src({
              state: "open",
              meta: { checks: { required: 3, passing: 3, failing: 0, pending: 0, failed: [] } },
            }),
          ],
        })}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/required checks failing/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/card.test.tsx )`

Expected: FAIL — `Unable to find a label with the text of: 4 required checks failing`.

- [ ] **Step 3: Add the icon**

In `components/board/card.tsx`:

Change the `@/lib/pr` import (lines 4-11) to add `checksFailingCount`:

```tsx
import {
  prProgress,
  sourceUrl,
  hasConflict,
  unresolvedCount,
  linkLabel,
  isMergedState,
  checksFailingCount,
} from "@/lib/pr";
```

Change the lucide import (line 13) to add `CircleX`:

```tsx
import { MessageSquare, TriangleAlert, ArrowRight, Lock, Link2, CircleX } from "lucide-react";
```

Add after `const unresolved = unresolvedCount(item.sources);` (line 77):

```tsx
  const failingChecks = checksFailingCount(item.sources);
```

Add the icon inside the header icon cluster, immediately after the `conflict` icon (line 90):

```tsx
          {failingChecks > 0 && (
            <CircleX className="size-3 text-st-blocked" aria-label={`${failingChecks} required checks failing`} />
          )}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/card.test.tsx )`

Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test && npx tsc --noEmit && npm run lint )`

Expected: all PASS, no type or lint errors.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short )`

Expected: everything modified/untracked, nothing staged. Do NOT commit.

---

### Task 7: Live verification in the browser

Unit tests passing is not sufficient here. This project has a known failure mode where render tests pass while the real UI is silently broken, and Task 2 has no unit test at all. Every render branch must be seen against real synced data.

**Files:** none — verification only.

- [ ] **Step 1: Build to catch production-only breakage**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm run build )`

Expected: build succeeds.

- [ ] **Step 2: Start the dev server and sync**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm run dev )` then `curl -s -X POST http://localhost:3000/api/sync`

Expected: server on `:3000`; sync returns a JSON result with a non-zero `synced` count.

- [ ] **Step 3: Re-probe the fixtures (they drift as CI re-runs)**

```bash
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){
  commits(last:1){nodes{commit{statusCheckRollup{contexts(first:100){nodes{
    __typename
    ... on CheckRun{ name status conclusion isRequired(pullRequestNumber:$n) }
    ... on StatusContext{ context state isRequired(pullRequestNumber:$n) }
  }}}}}}}}}' -F o=acme -F r=magic-onboarding -F n=147 \
| jq '[.data.repository.pullRequest.commits.nodes[0].commit.statusCheckRollup.contexts.nodes[] | select(.isRequired==true)] | {required: length, failing: [.[] | select((.conclusion // .state) | IN("FAILURE","ERROR"))] | map(.name // .context)}'
```

Expected (as of 2026-07-16): `required: 9`, failing includes `Lint`, `Lint`, `quality-gate-slit`, `quality-gate-ut`.

- [ ] **Step 4: Verify each render branch in the browser at `http://localhost:3000`**

Open each item's detail sheet and confirm:

| PR | Expected UI |
| --- | --- |
| `magic-onboarding#147` | `✗ 4 required failing` badge + **two separate `✗ Lint` chips with different links** + `quality-gate-slit`, `quality-gate-ut` chips |
| `api#66682` | `✗ 2 required failing` + chips for `Test changed-files`, `determine_final_status` |
| `dashboard#22204` | `✗ 1 required failing` + `Enhanced Guard Status` chip |
| `magic-onboarding#150` | `✓ required passing` — **must be green**, even though its rollup state is `FAILURE` from a non-required check |
| `magic-checkout-service#3189` | `✓ required passing` |
| `magic-onboarding#152` | **no checks badge at all** (merged + stacked, 0 required) |

Also confirm:
- No denominator (`2/9`, `9/9`) appears anywhere.
- Clicking a failing-check chip opens that check's run on GitHub, and does **not** also trigger the row's PR link.
- Cards for the failing items show the red `CircleX` icon; the `[ !N ]` needs-attention counter in the top bar has grown.
- Check the browser console for hydration or nested-anchor warnings. Verify on a **fresh server and a new tab** — `location.reload()` does not clear the console buffer.

- [ ] **Step 5: Verify across themes**

Switch through all five themes (light, dark, midnight, dracula, rosepine). Confirm the red failing badge and chips stay legible and don't blend into the background — a recurring problem in this project.

- [ ] **Step 6: Confirm everything is unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short )`

Expected: all changes present and **unstaged**. Do NOT commit — hand off to the developer for review.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §1 `PrChecks` type, `meta.checks`, no migration | 1, 2 |
| §1 Redefining `meta.checks` (both dead string reads replaced) | 4 (`status.ts`), 5 (`pr-row.tsx`) |
| §2 Widened GraphQL query with `isRequired` | 2 |
| §2 `normalizeChecks` state mapping, status-before-conclusion | 1 |
| §2 Writing `meta` (spread preserves `review`) | 2 |
| §2 `required` = reported, no denominators | 1 (type comment), 5 (badge) |
| §2 Per-base-branch / stacked ⇒ `required === 0` renders nothing | 5 (`required > 0` guard), 7 (#152 fixture) |
| §2 Error handling (`checks: null`, own try/catch, 100 cap) | 2 |
| §3 `lib/pr.ts` helpers | 3 |
| §3 `prInReview` structured read | 4 |
| §3 `attention.ts` clause | 4 |
| §4 Badge table, merged suppression, duplicate names, null url, nesting | 5 |
| §4 Card icon | 6 |
| §5 All listed tests | 1, 3, 4, 5, 6 |

**Deviations from the spec, deliberate:**
1. **Task 3 excludes merged/closed PRs from `anyChecksFailing`/`checksFailingCount`.** The spec only suppressed the *badge* on merged PRs; extending it to attention prevents a merged PR's stale failing checks from pinning an item to "needs attention" forever. Documented in Task 3.
2. **No commit steps.** Replaced with "leave unstaged" per the standing rule.
3. **Task 2 has no unit test** — it is I/O-bound and the suite has no `execFile` mocking precedent. Covered by Task 1's pure tests + Task 7's live probe. Called out explicitly rather than papered over with a mock that asserts a query string.

**Type consistency:** `PrChecks` (`required`/`passing`/`failing`/`pending`/`failed[{name,url}]`) is defined in Task 1 and used identically in Tasks 3-6. `prChecks`/`checksFailingCount`/`anyChecksFailing` are defined in Task 3 and consumed with matching signatures in Tasks 4-6. `normalizeChecks`/`RollupNode` are defined in Task 1 and consumed in Task 2.

**Placeholder scan:** none — every code step contains complete, runnable code.
