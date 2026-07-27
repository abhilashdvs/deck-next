# Required-Checks Tracking — Design

**Date:** 2026-07-16
**Status:** Approved, ready for implementation planning
**Scope:** deck-next

## Problem

Deck-next syncs each linked PR's state, mergeable status, comment count, and unresolved review
threads, but it tracks nothing about CI. When a PR's required builds fail, nothing in the tracker
shows it — you find out by opening the PR on GitHub. For an item with several stacked PRs across
repos, that means opening every one to answer "is anything red?".

This feature tracks, per PR, the status checks GitHub marks as **required for merge**, and surfaces
how many failed and which ones failed.

## Goals

- For each linked open PR, know how many required checks are passing, failing, and pending.
- Show *which* required checks failed, with a link straight to each failing run.
- Flag a work item for attention when any of its PRs has a failing required check.

## Non-goals

- Tracking checks that are *not* marked required. The signal here is "what blocks merge".
- A dedicated "CI failing" saved view or filter. Failing checks feed the existing needs-attention
  view instead.
- Re-running, cancelling, or otherwise acting on checks from deck-next. Read-only.
- Historical check runs or timing data. Only the current state of the latest commit.

## Decisions

| Decision | Choice |
| --- | --- |
| Which checks | Only those marked required for merge |
| States tracked | passing, failing, pending (all three) |
| What feeds attention | Failing only — all-passing-or-pending stays quiet |
| Failure detail | Failing check names, each linking to its run |
| Surfaces | PR row (detail sheet) + card indicator + needs-attention |
| Data source | Widen the existing per-PR GraphQL call, using `isRequired` |

## Architecture

Four layers, each independently testable:

1. **Fetch + normalize** (`lib/sync.ts`) — one GraphQL call per PR returns raw rollup contexts; a
   pure function turns them into a `PrChecks` value.
2. **Store** (`linked_sources.meta.checks`) — no schema change.
3. **Derive** (`lib/pr.ts`, `lib/attention.ts`, `lib/model/status.ts`) — pure reads over hydrated
   sources.
4. **Render** (`components/detail/pr-row.tsx`, `components/board/card.tsx`).

## 1. Data model

New type in `lib/types.ts`:

```ts
export interface PrChecks {
  // Required checks that have REPORTED on the latest commit — not the total
  // configured on the base branch. A required check that never ran is absent
  // from GitHub's rollup and cannot be counted. See §2 "required counts checks
  // that have REPORTED". This is why no surface renders a denominator.
  required: number;
  passing: number;
  failing: number;
  pending: number;
  failed: { name: string; url: string | null }[];
}
```

Persisted at `linked_sources.meta.checks`. **No migration** — `meta` is an existing JSON text
column, and `ImportRecord` already carries `meta`, so the sync → `importSources` → `updateSource`
path needs no new fields.

### Why JSON rather than dedicated columns

The existing scalars (`mergeable`, `comments_count`, `unresolved_threads`) each have their own
column, so columns would be the consistent-looking choice. They are not warranted here:

- Every consumer (card icon, attention, status, row badge) reads already-hydrated
  `ItemDetail.sources` in JavaScript. `needsAttention` filtering happens in JS
  (`lib/model/items.ts` filters on `attentionReason(...)`), not SQL. Nothing filters checks in SQL.
- `failed[]` is a variable-length list and belongs in JSON regardless; splitting counts into columns
  while the list stays in JSON would fragment one cohesive unit across two storage shapes.
- Columns would cost a migration for no current consumer.

**Future work:** if a "CI failing" saved view is ever added (it needs a SQL predicate), promote
`required`/`passing`/`failing`/`pending` to real columns then, keeping `failed[]` in `meta`.

### Redefining `meta.checks` is safe

`meta.checks` is read *today* as a string in two places — `lib/model/status.ts` (`prInReview`) and
`components/detail/pr-row.tsx` (`stateTags`) — but **sync never writes it**. `syncGithub` sets
`meta: review ? { review } : {}` and nothing else. Both reads are dead paths over data that does not
exist, so redefining `meta.checks` as a `PrChecks` object is a clean cutover with no stored data to
migrate. Both call sites are updated as part of this work (see §3).

## 2. Sync

`lib/sync.ts` already makes one `gh api graphql` call per PR (`ghUnresolvedThreads`). Widen that
same query rather than adding a second call. Rename it to reflect its broader job — it now returns
both unresolved threads and checks.

```graphql
query($o:String!,$r:String!,$n:Int!){
  repository(owner:$o,name:$r){
    pullRequest(number:$n){
      reviewThreads(first:100){ nodes{ isResolved } }
      commits(last:1){ nodes{ commit{ statusCheckRollup{ contexts(first:100){ nodes{
        __typename
        ... on CheckRun     { name    status conclusion detailsUrl isRequired(pullRequestNumber:$n) }
        ... on StatusContext{ context state              targetUrl  isRequired(pullRequestNumber:$n) }
      }}}}}}
    }
  }
}
```

`isRequired` is authoritative and needs no branch-protection lookup or base-branch resolution.
Local `gh` is 2.86.0; no version concerns.

### Verified against live data (2026-07-16)

The query above was run against real tracked PRs before this spec was finalized. Findings:

- **`isRequired` works with a non-admin token.** The signed-in token holds `pull,push,triage` on
  these repos — not `admin`. `isRequired` still correctly returns `true`, e.g. `dashboard#22204`
  reports 4 required checks (`Enhanced Guard Status`, `Security-Scan / Combined Security Status
  Check`, `Workflow Status`, `semgrep-cloud-platform/scan`).
- **This empirically kills Approach C.** `GET /repos/{o}/{r}/branches/{b}/protection` requires admin
  and returns 404 for every tracked repo with this token. A branch-protection join would not merely
  have been brittle — it would return nothing at all. Rulesets are also empty
  (`/rules/branches/master` → `[]`) on all eight repos, so these required checks come from classic
  branch protection, which only `isRequired` exposes here.
- Whether `isRequired` also reflects ruleset-based required checks is **unverified** — no tracked
  repo uses rulesets. It does not matter for the current repo set; do not rely on it.
- **The feature has real signal.** 7 of 9 open tracked PRs currently have ≥1 failing required
  check, ranging from 3 to 11 required checks per PR.

### Normalization

A pure exported `normalizeChecks(nodes): PrChecks` — no I/O, directly unit-testable. Keep only
nodes where `isRequired === true`, then map by `__typename`:

**CheckRun** — name = `name`, url = `detailsUrl`.

| Condition | State |
| --- | --- |
| `status !== "COMPLETED"` | pending |
| `conclusion` ∈ `SUCCESS`, `SKIPPED`, `NEUTRAL` | passing |
| `conclusion` ∈ `FAILURE`, `TIMED_OUT`, `CANCELLED`, `ACTION_REQUIRED`, `STARTUP_FAILURE` | failing |
| `conclusion` is anything else / null | pending |

**StatusContext** — name = `context`, url = `targetUrl`.

| Condition | State |
| --- | --- |
| `state === "SUCCESS"` | passing |
| `state` ∈ `FAILURE`, `ERROR` | failing |
| `state` ∈ `PENDING`, `EXPECTED` | pending |

The pending check is evaluated **before** the conclusion mapping: an in-flight CheckRun can carry a
stale `conclusion`, so `status` wins.

`SKIPPED` and `NEUTRAL` count as passing because they do not block merge. This keeps the model at
the three states chosen, rather than adding a fourth that no surface would render differently.

Failing entries are pushed to `failed[]` in the order GitHub returns them.

### Writing `meta`

`syncGithub` rebuilds `meta` per sync:

```ts
meta: { ...(review ? { review } : {}), ...(checks ? { checks } : {}) }
```

Spreading both keys preserves `review` — `updateSource` writes `meta` wholesale, so a partial object
would silently drop it.

### `required` counts checks that have REPORTED, not checks that are CONFIGURED

This is the most important semantic in this spec, and it is counter-intuitive.

`statusCheckRollup.contexts` contains only checks that have **actually reported on the latest
commit**. A configured required check that has not run — because of workflow path filters, or
because it simply hasn't started — is **absent from the rollup entirely**. It does not appear as
pending or `EXPECTED`. `isRequired` can only mark up contexts that are present, so it cannot reveal
required checks that never reported.

Verified live: `magic-onboarding#147` and `#150` **both target `master`** — identical branch
protection — yet report different required sets:

| PR | required reported | contexts |
| --- | --- | --- |
| `#147` | 9 | `Lint` ×2, `Workflow Status` ×2, `quality-gate-slit`, `quality-gate-ut`, `github/combined-status-check`, `rundeck/…/slit-test`, `semgrep-cloud-platform/scan` |
| `#150` | 3 | `Lint` ×2, `Workflow Status` |

`#150`'s set is a strict subset: its other required contexts have not reported.

**Consequence — do not render a denominator.** `PrChecks.required` is "required checks reported so
far", so a badge reading `✓ 3/3 required` on `#150` would be a false all-clear: four more required
contexts may still land and fail. The `failing` count and `failed[]` are unaffected and remain
exact — a failing required check is unambiguously real. Only the *completeness* claim is unsound, so
§4 states each badge without a total. Renaming the field to `reported` was considered and rejected:
`required` is accurate (every counted check *is* required), and this section defines the semantic.

**Out of scope, noted:** `mergeStateStatus` (e.g. `BLOCKED`, `BEHIND`) is the field that would
authoritatively answer "is this PR actually gated?". It is one extra field on the same query, but no
approved surface consumes it, so it is not fetched. That is the natural extension if a trustworthy
"ready to merge" signal is ever wanted.

### Required checks are per-base-branch — stacked PRs may show none

Branch protection attaches to the **base branch**, so `isRequired` is relative to what a PR targets.
A PR into `master` gets that branch's required checks; a stacked PR targeting another PR's feature
branch has no protection on that base and is expected to report zero required checks.

Stacked PRs are a first-class concept in deck-next, so `required === 0` is an **expected state, not
an error**. It renders no badge (§4), which is correct: nothing is gating that PR's merge.

**Confidence:** the mechanism (protection is per-branch) is certain, but this is *not* cleanly
demonstrated in the current data. The one 0-required example, `magic-onboarding#152`
(base `feat/shopify-theme-graphql-migration`), is **both stacked and already merged**, so its result
has two confounded causes. Every *open* tracked PR targets a protected branch and reports 3–11
required checks. Treat "stacked ⇒ 0 required" as expected-but-unverified; it changes no behavior
either way, since `required === 0` renders nothing regardless of cause.

Do not "fall back" to showing non-required checks when `required === 0` — that would report a
different thing under the same label and break the feature's one promise ("what blocks merge").

### Error handling

- `normalizeChecks` returns a zero-valued `PrChecks` (`required: 0`) when the rollup is absent — a
  PR with no commits or no checks configured. This renders no badge, and is indistinguishable from
  (and treated the same as) the stacked-PR case above.
- If the GraphQL call throws, the helper returns `{ unresolvedThreads: 0, checks: null }` and `meta`
  omits `checks` for that cycle. This matches the existing unresolved-threads behavior, which
  already returns `0` on failure. **Trade-off:** a transient GraphQL error blanks the badge until
  the next sync (≤2 min) rather than showing stale data. Accepted for consistency with the
  established pattern and to avoid a read-modify-merge of existing `meta`.
- The GraphQL call stays wrapped in its own try/catch inside the per-PR flow, so a checks failure
  never fails the whole PR. If `gh pr view` itself fails, the PR is marked `skipped` exactly as
  today.
- Contexts are capped at `first: 100`, matching the existing `reviewThreads` cap. A PR with >100
  required checks would truncate; this is not a realistic case and is not handled.

## 3. Consumers

**`lib/pr.ts`** — new pure helpers, alongside the existing `hasConflict` / `unresolvedCount`:

- `prChecks(src): PrChecks | null` — typed read of `src.meta?.checks`.
- `checksFailingCount(sources): number` — sum of `failing` across PR sources.
- `anyChecksFailing(sources): boolean`.

**`lib/model/status.ts`** — `prInReview` currently does:

```ts
const checks = String(meta.checks ?? "passing").toLowerCase();
const checksOk = checks === "" || checks === "passing" || checks === "success";
```

Replace with a structured read: `checksOk = !checks || checks.failing === 0`. Pending does **not**
knock a PR out of `in_review` — a PR waiting on CI is still in review. A PR with failing required
checks makes a multi-PR item compute to `in_progress` rather than `in_review`.

**`lib/attention.ts`** — add a clause to `attentionReason`, after the conflicts check:

```ts
if (anyChecksFailing(item.sources)) return "Required checks failing";
```

Only failing triggers attention; all-passing-or-pending stays quiet. The existing guards still
apply first — snoozed items and `done` items never raise attention.

## 4. UI

**PR row** (`components/detail/pr-row.tsx`) replaces the current string-based `meta.checks` tag in
`stateTags` with a structured summary badge, using the existing `TAG_CLS` classes:

| Condition | Badge | Class |
| --- | --- | --- |
| `required === 0` | none | — |
| `failing > 0` | `✗ 2 required failing` | `crit` |
| `failing === 0 && pending > 0` | `⋯ 2 required pending` | `rev` |
| all passing | `✓ required passing` | `ok` |

**No denominators** — per §2, `required` counts only checks that have *reported*, so `2/9` would
imply a completeness the data cannot support. The failing count is exact and leads the badge, which
is the number being asked for. The all-passing badge deliberately omits a count too: "3 passing"
invites reading 3 as "all of them".

The badge is suppressed for merged and closed PRs — required checks are moot once merged, and the
row already carries a `merged` tag.

Below the row, each failing check renders as its own small red chip linking to its `detailsUrl`.

**Check names are not unique.** Two required checks can share a name when they come from different
workflows — `magic-onboarding#147` currently fails `Lint, Lint, quality-gate-slit, quality-gate-ut`,
with two distinct `Lint` runs at different URLs. So:

- React keys for the chips must be the **array index**, never the check name.
- Do not de-duplicate `failed[]` by name — the two `Lint` failures are genuinely different runs and
  each needs its own link.

Required checks are also not only builds: `terminals#4444` requires `Ready For Review Label Added`
and `Dev Testing Started Label Added`. The badge says "required", not "builds", and the naming
throughout should avoid implying these are all CI jobs.

**HTML nesting constraint:** `PrRow` currently returns a single `<a>` wrapping the whole row, so
per-check `<a>` chips nested inside would be invalid HTML (and browsers will re-parent them).
Restructure `PrRow` to return a `<div>` wrapper containing (a) the existing row body as the anchor
to the PR, and (b) the failing-check chips as a **sibling** block. The summary badge stays inside
the anchor as plain text; only the individual check chips are links.

Failing checks with a null `url` render as non-link text rather than a dead anchor.

**Card** (`components/board/card.tsx`) adds a red `CircleX` icon to the existing header icon cluster
(next to the conflict `TriangleAlert` and unresolved `MessageSquare`) when `anyChecksFailing`, with
an `aria-label` naming the count, matching how the neighbouring icons are labelled.

## Testing

Unit tests, extending the existing Vitest suite:

- **`normalizeChecks`**
  - Mixed `CheckRun` + `StatusContext` nodes → correct counts.
  - `isRequired: false` nodes are excluded from every count and from `failed[]`.
  - Each conclusion → state mapping, including `SKIPPED`/`NEUTRAL` as passing.
  - `status: "IN_PROGRESS"` with a stale `conclusion: "SUCCESS"` → pending, not passing.
  - Empty/absent rollup → `{ required: 0, passing: 0, failing: 0, pending: 0, failed: [] }`.
  - `failed[]` carries name and url for each failing check.
  - **Two failing checks sharing a name** (the real `Lint, Lint` case) both survive in `failed[]`
    with their distinct urls — no de-duplication.
- **`attentionReason`** — a source with `meta.checks.failing > 0` → `"Required checks failing"`;
  all-pending → `null`; a `done` item with failing checks → `null`.
- **`computeStatus` / `prInReview`** — failing required checks keep a multi-PR item out of
  `in_review`; pending-only checks still allow `in_review`.

## Implementation order

1. `PrChecks` type + `normalizeChecks` + its tests (pure, no dependencies).
2. Widen the GraphQL query and wire `meta.checks` in `syncGithub`.
3. `lib/pr.ts` helpers.
4. `attention.ts` and `status.ts` consumers + tests.
5. `pr-row.tsx` restructure and badge.
6. `card.tsx` icon.
7. Verify against live data in the browser at `localhost:3000`.

Steps 1–4 are testable without any UI. Step 7 matters: this project has a known failure mode where
render unit tests pass while the real UI is wrong, so the badge and icon must be confirmed against
real synced PRs. Known-good fixtures as of 2026-07-16, covering every render branch:

| PR | State to confirm |
| --- | --- |
| `magic-onboarding#147` | 9 required, 4 failing — incl. two same-named `Lint` chips with distinct links |
| `api#66682` | 11 required, 2 failing |
| `dashboard#22204` | 4 required, 1 failing |
| `magic-onboarding#150` | 3 required, 0 failing → green badge (the reported-subset case from §2: its rollup is `FAILURE` from a *non-required* check, which must **not** turn the badge red) |
| `magic-checkout-service#3189` | 6 required, 0 failing → green badge |
| `magic-onboarding#152` | 0 required → **no badge at all** (merged + stacked) |

These are live PRs and will drift as CI re-runs; re-probe with the GraphQL query in §2 before
relying on them.
