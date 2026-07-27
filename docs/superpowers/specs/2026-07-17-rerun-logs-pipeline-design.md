# Re-run, logs & pipeline status — design

**Date:** 2026-07-17
**Status:** Approved, ready for implementation planning
**Scope:** deck-next

## Problem

Deck-next surfaces *which* required checks failed, but acting on them means leaving for GitHub. For a failing PR you currently have to: open the PR, find the run, read the log, click re-run. This feature brings four things into the detail sheet — re-run one failed job, re-run a whole run, see the real error, and see the pipeline's state.

This **reverses an explicit non-goal** of the required-checks design (`2026-07-16-required-checks-tracking-design.md`: *"Re-running, cancelling, or otherwise acting on checks from deck-next. Read-only."*). That reversal is deliberate and is the single most consequential thing here: deck-next becomes a **write client against shared Acme CI**.

## Verified constraints (probed against live data, 2026-07-17)

Every decision below rests on facts checked against three real failing PRs (`magic-onboarding#147`, `terminals#4444`, `api#66682`), not assumptions.

**Only about half of real failures are actionable.** The 11 currently-failing required checks split across two GitHub node types:

| Check | Type | URL | Actionable? |
| --- | --- | --- | --- |
| `Lint` ×2 (`mo#147`) | CheckRun | `…/actions/runs/29325766675/job/87061580817` | ✅ |
| `Ready For Review Label Added` (`terminals#4444`) | CheckRun | `…/actions/runs/…/job/…` | ✅ (but see below) |
| `Dev Testing Started Label Added` (`terminals#4444`) | CheckRun | `…/actions/runs/…/job/…` | ✅ (but see below) |
| `Test changed-files`, `determine_final_status` (`api#66682`) | CheckRun | `…/actions/runs/…/job/…` | ✅ |
| `quality-gate-ut` | StatusContext | `…/actions/runs/29325766682` (**no** `/job/`) | ❌ |
| `quality-gate-slit` | StatusContext | `argo.dev.acme.in/workflows/…` | ❌ |
| `BVT Workflow` | StatusContext | `deploy.acme.com/…` (Spinnaker) | ❌ |
| `github/combined-status-check` | StatusContext | `https://github.com/acme/terminals` (repo root, no run) | ❌ |

GitHub has no API to re-run a StatusContext and hosts no logs for one — those live in Argo, Spinnaker, or nowhere. **Scope is therefore GitHub Actions only**, with everything else honestly marked un-actionable rather than given a button that would silently fail.

**Two of the re-runnable checks are label gates.** `Ready For Review Label Added` / `Dev Testing Started Label Added` are Actions jobs that assert a label exists. Re-running them is *technically* possible and *semantically* useless — they fail again until the label is added. The design does not special-case these (detecting "this job is a label gate" is unreliable), but it is why the feature must not promise that re-running fixes anything.

**Failures span multiple workflow runs per PR.** `mo#147` → runs `29325764261` + `29325766675`; `api#66682` → `29553312321` + `29553312442`; `terminals#4444` → one run. So re-run actions are **run-scoped, not PR-scoped**.

**Logs are small, and the tail is worthless.** The failing `Lint` job's log is 41 KB / 457 lines. Its last 6 lines are `git config` cleanup and a Node-20 deprecation warning — *nothing about the failure*. A naive "show the last N lines" would show noise. But the log contains **4 `##[error]` lines** carrying the entire actionable payload:

```
internal/shopify/browser/totp.go:59:1: File is not properly formatted (golines)
internal/shopify/browser/chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)
internal/shopify/browser/cli_auth_error_paths_test.go:107:2: G101: Potential hardcoded credentials (gosec)
issues found
```

**The job object already pinpoints the failure.** `GET /actions/jobs/{id}` returns `steps[]` with per-step conclusions — for that job, every step passed except `golangci-lint`. This is a precise, tiny answer that needs no log fetch at all.

**The token permits writes.** `repos/acme/api` → `{admin:false, maintain:false, pull:true, push:true, triage:true}`. `push` implies `actions: write`. **This was not confirmed by firing a test re-run** — doing so would spend real CI on a live PR without authorization. First real proof arrives at live-verification time.

## Goals

- Re-run a single failed Actions job, a run's failed jobs, or a run's every job — from the sheet.
- Show the real error (the `##[error]` lines), not a log dump.
- Show the pipeline: the workflow run's name/conclusion/attempt and all its jobs, plus which step broke.
- Never present an action that cannot work.

## Non-goals

- Argo / Spinnaker / any non-GitHub-Actions system. Their checks are read-only deep links, as today.
- Cancelling runs. (`POST /actions/runs/{id}/cancel` exists; nobody asked for it.)
- A PR-wide "re-run everything across all runs" button — it would fan out to N calls across N runs. **Explicitly deferred as YAGNI**; the user was offered it and it was not requested. Easy to add later: iterate the distinct `runId`s the parser already yields.
- Storing run/job/step/log data in SQLite. It is volatile and only needed while looking at it.
- Special-casing label-gate jobs.

## Decisions

| Decision | Choice |
| --- | --- |
| Scope | GitHub Actions only; non-Actions checks stay read-only links |
| Pipeline status | Group by workflow run: run name/conclusion/attempt + **all** jobs (not just failing) + the failing step name |
| Logs | Extract `##[error]` lines on demand; never dump the raw log; never use the tail |
| Write safety | Inline confirm, reusing the existing `confirmDelete` pattern in `detail-sheet.tsx` |
| Fetch timing | On expand — not in the 2-minute background sync |
| Re-run scope | Run-scoped (3 actions), not PR-scoped |
| Data model | **No change** — `runId`/`jobId` are parsed from the `url` already in `meta.checks.failed[]` |

## 1. Data model: unchanged

`meta.checks.failed[]` already stores `{name, url}`. A single regex over `url` yields everything needed:

```ts
// lib/actions-url.ts
export interface ActionsRef { owner: string; repo: string; runId: string; jobId: string }

export function parseActionsUrl(url: string | null): ActionsRef | null {
  if (!url) return null;
  const m = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)\/job\/(\d+)/.exec(url);
  return m ? { owner: m[1], repo: m[2], runId: m[3], jobId: m[4] } : null;
}
```

Returning `null` **is** the "not actionable" signal, and it is correct for every non-Actions case in the table above — including `quality-gate-ut`, whose URL is an Actions *run* but has no `/job/` segment, and third-party CheckRuns like `semgrep-cloud-platform/scan` (a CheckRun whose `detailsUrl` points at `semgrep.dev`, and which GitHub's re-run API cannot drive anyway). No new field to populate, migrate, or keep in sync — and no possibility of the stored flag disagreeing with the URL.

The `owner` is parsed from the URL rather than hardcoded to `acme`, unlike `lib/pr.ts`'s `sourceUrl` fallback. This costs nothing and avoids adding a fourth hardcoded-org site.

## 2. Architecture: three routes, shelling `gh`

`lib/sync.ts` already shells `gh` via `execFile`, and `gh` handles auth — so these routes do the same rather than inventing token handling. All live under `app/api/actions/`:

| Route | Does | `gh` calls |
| --- | --- | --- |
| `GET /api/actions/run?owner=&repo=&runId=` | run meta + jobs + steps | 2 |
| `GET /api/actions/errors?owner=&repo=&jobId=` | fetch log → extracted `##[error]` lines | 1 |
| `POST /api/actions/rerun` | fire a re-run | 1 |

`POST /api/actions/rerun` takes a discriminated body and maps 1:1 onto GitHub's own three buttons:

```ts
type RerunBody =
  | { owner: string; repo: string; scope: "job";        jobId: string }  // POST /actions/jobs/{jobId}/rerun
  | { owner: string; repo: string; scope: "run-failed"; runId: string }  // POST /actions/runs/{runId}/rerun-failed-jobs
  | { owner: string; repo: string; scope: "run-all";    runId: string }; // POST /actions/runs/{runId}/rerun
```

### Argument validation (required, not optional)

These routes take `owner`/`repo`/ids from the client and interpolate them into a `gh api` path. `execFile` spawns no shell, so there is no shell-injection vector — but a crafted `repo` like `../../orgs/x` would still **traverse the API path**. Every route validates before use and returns 400 on mismatch:

```ts
const SAFE_NAME = /^[\w.-]+$/;   // owner, repo
const SAFE_ID   = /^\d+$/;       // runId, jobId
```

This is a local single-user app, but the routes are unauthenticated and reachable from any page the browser loads; validation is cheap and the failure mode (driving `gh` against an arbitrary path with a `push`-scoped token) is not.

### `maxBuffer` (a real trap)

Node's `execFile` defaults to a **1 MB** `maxBuffer` and *errors* when exceeded. The sampled log is 41 KB, but job logs are unbounded — a verbose test job will blow past 1 MB and the route would fail with `stdout maxBuffer exceeded` rather than anything diagnosable. The log fetch passes `{ maxBuffer: 20 * 1024 * 1024 }`. The existing `gh` calls in `sync.ts` return small JSON and are left alone.

## 3. Log extraction

```ts
// lib/job-log.ts
const ERROR_LINE = /^\S+\s+##\[error\](.*)$/;   // "2026-07-14T10:34:38.3855791Z ##[error]foo.go:59:1: ..."
const MAX_ERRORS = 20;

export function extractErrors(log: string): { errors: string[]; truncated: number } {
  const all: string[] = [];
  for (const line of log.split("\n")) {
    const m = ERROR_LINE.exec(line);
    if (m) all.push(m[1].trim());
  }
  return { errors: all.slice(0, MAX_ERRORS), truncated: Math.max(0, all.length - MAX_ERRORS) };
}
```

The leading ISO timestamp is stripped (it is noise in a 560px column). `MAX_ERRORS` guards the pathological case — a lint failure can emit hundreds of `##[error]` lines; the UI shows "…and N more" and the GitHub link.

**Fallback when a job emits no `##[error]` markers** (a plain `go test` failure may not): return `errors: []` and render *"No error markers in this log — open full log ↗"*. There is deliberately no auto-excerpt fallback: the tail was measured to be pure noise, so any excerpt would be actively misleading.

## 4. UI

### Placement: an expander, because density already cost us once

The immediately-preceding feature (`2026-07-16-detail-sheet-ux-rework-design.md`) existed *because* this sheet was too cluttered. A permanently-expanded pipeline tree on each of 9 PRs would undo it. So the row renders exactly as today, and expansion is opt-in:

```
| Lint                                          ↗
| ▾ Lint                                        ↗
|     CI · failure · attempt 1    [re-run failed] [re-run all]
|     failed at golangci-lint                   [re-run job]
|     totp.go:59:1: File is not properly formatted (golines)
|     chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)
|     Lint ✗ · Test ✓ · Proto Lint ✓ · Build ○
| quality-gate-slit                             ↗
```

Expansion is also what triggers the fetch — nothing is requested until looked at, which is why none of this belongs in the sync loop.

- **Actionable check** (`parseActionsUrl` → non-null): name becomes a `<button>` toggle with a chevron; a separate `↗` `<a>` preserves today's GitHub deep link.
- **Non-actionable check** (`parseActionsUrl` → null): renders exactly as today — a plain link, no chevron. **The absence of a chevron is the signal**; a `title="External check — not re-runnable from deck"` explains on hover. No inline "not re-runnable" label: that would add noise to 5 of 11 rows, re-introducing the clutter we just removed.

### Component boundary

`pr-row.tsx` stays presentational. A new `components/detail/failing-checks.tsx` owns the failing list, per-item expand state, the fetch, and the re-run controls — the same extraction pattern as the recent `item-fields.tsx` / `pr-group.tsx`. `pr-row.tsx` renders `<FailingChecks failed={…} />` in place of its current inline block.

### Stacking

The failing-checks block already carries `relative z-10` to clear `PrRow`'s stretched-link `::after` overlay; the new buttons inherit that and stay clickable. `PrGroup`'s hover overlay remains `z-20` above both. No new stacking work — but the existing `a a` nesting guard test must keep passing, since the block now contains buttons *and* anchors.

### Re-run interaction

Each button uses the inline-confirm pattern already in `detail-sheet.tsx` (`confirmDelete`): click → the control swaps in place to `Re-run Lint? [Yes] [Cancel]`. This matters more than usual here — the PR card is a stretched link, so an unconfirmed misclick would otherwise fire real CI.

On success, re-fetch **only that run's** detail (`GET /api/actions/run`), which returns `queued`/`in_progress`. This gives immediate honest feedback without triggering a full 19-PR sync. The 2-minute sync then picks up the check-state change normally.

## 5. Data flow

```
meta.checks.failed[{name,url}]  (already synced, unchanged)
        │
        ├─ parseActionsUrl(url) → null ────────────► plain link (today's behavior)
        │
        └─ → {owner,repo,runId,jobId}
                 │  (on expand only)
                 ├─ GET /api/actions/run    → run + jobs + steps → pipeline line + failing step
                 ├─ GET /api/actions/errors → ##[error] lines    → inline error list
                 └─ POST /api/actions/rerun → refetch run        → "queued"
```

## 6. Testing

- **`parseActionsUrl`** against all 11 real URLs from the table above: both `Lint` job URLs → `{owner:"acme", repo:"magic-onboarding", runId, jobId}`; `quality-gate-ut`'s run-only URL → `null`; the Argo, Spinnaker, repo-root, and `semgrep.dev` URLs → `null`; plus `null` input → `null`.
- **`extractErrors`** against a fixture built from the real log's actual lines: asserts it finds the 3 golangci-lint violations with `file:line` intact, strips the ISO timestamps, and **does not** include the trailing `##[warning]Node.js 20 is deprecated` line or the `git config` tail. Plus: no-markers input → `{errors: [], truncated: 0}`; a >20-marker input → 20 returned with correct `truncated` count.
- **Route tests** mock `execFile`: assert the exact `gh` argv built for each of the three re-run scopes, that `maxBuffer` is passed on the log fetch, and that a bad `owner`/`repo`/id (`../../x`, `abc`) returns 400 without invoking `execFile` at all.
- **`FailingChecks`** render tests: actionable check renders a toggle + link; non-actionable renders link only, no toggle; expanding fetches; the confirm step must be passed before a re-run POST is issued.
- **No test fires a real re-run.** The POST paths are verified by asserting the constructed `gh` argv, never by execution.

## 7. Risks

- **Firing CI on shared infrastructure.** A bug here costs Acme runner time, not just local state. Mitigated by inline confirm, run-scoped (never PR-wide fan-out) actions, and no re-run in any automated path.
- **`actions: write` unproven.** `push: true` implies it; first real evidence comes at live verification, where a single deliberate re-run on one of the user's own PRs is the test.
- **`gh` must be authenticated wherever deck runs.** This deepens the local-only coupling already noted in the hosting discussion — it does not create it.
- **Rate limits.** On-demand fetching keeps this negligible: 2–3 calls per expand, versus ~40 per sync cycle had this gone into the sync loop.
