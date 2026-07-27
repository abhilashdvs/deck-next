# Re-run, Logs & Pipeline Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the detail sheet, re-run a failed GitHub Actions job (or a whole run), see the real `##[error]` lines, and see the workflow run's pipeline state — without leaving deck.

**Architecture:** Two pure parsers (`parseActionsUrl`, `extractErrors`) turn data we already store into everything needed — no schema change. Three new API routes under `app/api/actions/` shell `gh` through a thin, mockable `lib/gh.ts` seam. A new `failing-checks.tsx` owns per-check expansion, fetches run/error detail only on expand, and gates every re-run behind an inline confirm.

**Tech Stack:** Next.js 16 (App Router route handlers), React 19, TypeScript, SWR, Vitest + @testing-library/react, `gh` CLI, lucide-react.

**Spec:** `docs/superpowers/specs/2026-07-17-rerun-logs-pipeline-design.md` — read it first. The "Verified constraints" section explains why the scope is Actions-only; it is not an arbitrary limit.

## Global Constraints

- **NEVER commit. NEVER stage.** Leave every edit unstaged for the developer. Do not run `git add`, `git commit`, `git push`, or `git stash`.
- **Working directory:** `/Users/dontula.abhilash/Documents/onlymagic/deck-next`. Bash `cd` throws `GVM_ROOT not set` — use a subshell: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; <cmd> )`.
- **NO TEST MAY FIRE A REAL RE-RUN.** Re-running spends real CI on shared Acme infrastructure. Verify POST paths by asserting the constructed `gh` argv only. The single deliberate live re-run happens once, by a human decision, in Task 8.
- **Every route validates before touching `gh`:** `owner`/`repo` against `/^[\w.-]+$/`, ids against `/^\d+$/`, returning 400. `execFile` spawns no shell (no shell injection), but a crafted `repo` like `../../orgs/x` would traverse the `gh api` path.
- **The log fetch MUST pass `maxBuffer: 20 * 1024 * 1024`.** Node's `execFile` default is 1 MB and *errors* past it; job logs are unbounded.
- **No data-model change.** `runId`/`jobId` are parsed from the `url` already in `meta.checks.failed[]`. Do not add fields to `PrChecks` or the DB.
- **`parseActionsUrl(...) === null` is the single source of truth for "not actionable."** Never add a parallel flag.
- The existing `a a` nesting-guard test in `test/pr-row.test.tsx` must keep passing — the failing-checks block will contain both buttons and anchors.
- camelCase; match surrounding idiom; comments only for constraints the code can't show.
- Test one file: `npx vitest run <file>`. Full suite: `npm test`.

---

### Task 1: `parseActionsUrl` — the actionability test

**Files:**
- Create: `lib/actions-url.ts`
- Test: `test/actions-url.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ActionsRef` (`{ owner: string; repo: string; runId: string; jobId: string }`) and `parseActionsUrl(url: string | null): ActionsRef | null`, both from `@/lib/actions-url`.

- [ ] **Step 1: Write the failing test**

Create `test/actions-url.test.ts`. Every URL below is real, captured from the user's live PRs:

```ts
import { describe, it, expect } from "vitest";
import { parseActionsUrl } from "@/lib/actions-url";

describe("parseActionsUrl", () => {
  it("parses an Actions job url into owner, repo, runId and jobId", () => {
    expect(
      parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817"),
    ).toEqual({ owner: "acme", repo: "magic-onboarding", runId: "29325766675", jobId: "87061580817" });
  });

  it("parses the second Lint job (same name, different run) distinctly", () => {
    expect(
      parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325764261/job/87061573038"),
    ).toEqual({ owner: "acme", repo: "magic-onboarding", runId: "29325764261", jobId: "87061573038" });
  });

  it("rejects a run url with no job segment (quality-gate-ut is a StatusContext)", () => {
    expect(parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325766682")).toBeNull();
  });

  it("rejects an Argo url (quality-gate-slit)", () => {
    expect(
      parseActionsUrl("https://argo.dev.acme.in/workflows/argo-workflows/slit-magic-onboarding-jlhgo?tab=workflow"),
    ).toBeNull();
  });

  it("rejects a Spinnaker url (BVT Workflow)", () => {
    expect(
      parseActionsUrl("https://deploy.acme.com//#/applications/bvt-api/executions/details/01KXQ7S8GGZAWEYQXD0WFE795X"),
    ).toBeNull();
  });

  it("rejects a bare repo url (github/combined-status-check)", () => {
    expect(parseActionsUrl("https://github.com/acme/terminals")).toBeNull();
  });

  it("rejects a third-party CheckRun url (semgrep) — a CheckRun GitHub still cannot re-run", () => {
    expect(parseActionsUrl("https://semgrep.dev/orgs/acme/projects/5086932/scans/192798035")).toBeNull();
  });

  it("rejects null and empty input", () => {
    expect(parseActionsUrl(null)).toBeNull();
    expect(parseActionsUrl("")).toBeNull();
  });

  it("rejects a non-https or foreign host that merely contains the path shape", () => {
    expect(parseActionsUrl("https://evil.example.com/acme/api/actions/runs/1/job/2")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/actions-url.test.ts )`

Expected: FAIL — cannot find module `@/lib/actions-url`.

- [ ] **Step 3: Write the implementation**

Create `lib/actions-url.ts`:

```ts
export interface ActionsRef {
  owner: string;
  repo: string;
  runId: string;
  jobId: string;
}

// A failing check is re-runnable only if it is a real GitHub Actions job, and
// that is exactly what this URL shape proves. Returning null IS the
// "not actionable" signal — external StatusContexts (Argo, Spinnaker), bare
// repo links, and third-party CheckRuns (semgrep) all correctly fail to match,
// as does an Actions *run* url with no /job/ segment.
const ACTIONS_JOB_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)\/job\/(\d+)/;

export function parseActionsUrl(url: string | null): ActionsRef | null {
  if (!url) return null;
  const m = ACTIONS_JOB_URL.exec(url);
  return m ? { owner: m[1], repo: m[2], runId: m[3], jobId: m[4] } : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/actions-url.test.ts )`

Expected: PASS — all 9 tests green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors. (There are ~4 pre-existing errors in `test/api.test.ts` and `test/model.phase3.test.ts` — ignore those; confirm nothing new from your files.)

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/actions-url.ts test/actions-url.test.ts )`

Expected: both new, unstaged. Do NOT commit.

---

### Task 2: `extractErrors` — pull the real errors out of a job log

**Files:**
- Create: `lib/job-log.ts`
- Test: `test/job-log.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `extractErrors(log: string): { errors: string[]; truncated: number }` from `@/lib/job-log`.

- [ ] **Step 1: Write the failing test**

Create `test/job-log.test.ts`. The fixture lines are verbatim from the real log of `magic-onboarding` job `87061580817`:

```ts
import { describe, it, expect } from "vitest";
import { extractErrors } from "@/lib/job-log";

// Real lines from magic-onboarding job 87061580817 (the failing Lint job),
// including the trailing noise that a naive "show the tail" approach would
// have surfaced instead of the actual errors.
const REAL_LOG = [
  "2026-07-14T10:33:26.1000000Z ##[group]Run actions/checkout@v4",
  "2026-07-14T10:33:27.2000000Z [command]/usr/bin/git init",
  "2026-07-14T10:34:38.3855791Z ##[error]internal/shopify/browser/totp.go:59:1: File is not properly formatted (golines)",
  "2026-07-14T10:34:38.3870586Z ##[error]internal/shopify/browser/chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)",
  "2026-07-14T10:34:38.3874817Z ##[error]internal/shopify/browser/cli_auth_error_paths_test.go:107:2: G101: Potential hardcoded credentials (gosec)",
  "2026-07-14T10:34:38.3892817Z ##[error]issues found",
  "2026-07-14T10:34:39.1468558Z Cleaning up orphan processes",
  "2026-07-14T10:34:39.1788295Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20",
].join("\n");

describe("extractErrors", () => {
  it("extracts every ##[error] line with its timestamp stripped", () => {
    const { errors } = extractErrors(REAL_LOG);
    expect(errors).toEqual([
      "internal/shopify/browser/totp.go:59:1: File is not properly formatted (golines)",
      "internal/shopify/browser/chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)",
      "internal/shopify/browser/cli_auth_error_paths_test.go:107:2: G101: Potential hardcoded credentials (gosec)",
      "issues found",
    ]);
  });

  it("excludes warnings, group markers, and command noise", () => {
    const { errors } = extractErrors(REAL_LOG);
    expect(errors.join("\n")).not.toContain("Node.js 20 is deprecated");
    expect(errors.join("\n")).not.toContain("Cleaning up orphan processes");
    expect(errors.join("\n")).not.toContain("##[group]");
    expect(errors.join("\n")).not.toContain("git init");
  });

  it("reports nothing truncated for a normal log", () => {
    expect(extractErrors(REAL_LOG).truncated).toBe(0);
  });

  it("returns an empty result when a job emits no error markers", () => {
    const log = "2026-07-14T10:33:26.1000000Z ok\n2026-07-14T10:33:27.2000000Z done";
    expect(extractErrors(log)).toEqual({ errors: [], truncated: 0 });
  });

  it("caps at 20 errors and reports how many were dropped", () => {
    const log = Array.from({ length: 25 }, (_, i) => `2026-07-14T10:34:38.0000000Z ##[error]problem ${i}`).join("\n");
    const { errors, truncated } = extractErrors(log);
    expect(errors).toHaveLength(20);
    expect(errors[0]).toBe("problem 0");
    expect(errors[19]).toBe("problem 19");
    expect(truncated).toBe(5);
  });

  it("handles an empty log", () => {
    expect(extractErrors("")).toEqual({ errors: [], truncated: 0 });
  });

  it("tolerates CRLF line endings", () => {
    const log = "2026-07-14T10:34:38.0000000Z ##[error]boom\r\n2026-07-14T10:34:39.0000000Z done\r\n";
    expect(extractErrors(log).errors).toEqual(["boom"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/job-log.test.ts )`

Expected: FAIL — cannot find module `@/lib/job-log`.

- [ ] **Step 3: Write the implementation**

Create `lib/job-log.ts`:

```ts
// GitHub job logs prefix every line with an ISO timestamp and mark real
// failures with ##[error]. Those markers carry the entire actionable payload —
// the log's tail is git cleanup and deprecation warnings, so there is
// deliberately no tail-based fallback.
const ERROR_LINE = /^\S+\s+##\[error\](.*)$/;
const MAX_ERRORS = 20;

export function extractErrors(log: string): { errors: string[]; truncated: number } {
  const all: string[] = [];
  for (const line of log.split("\n")) {
    const m = ERROR_LINE.exec(line.replace(/\r$/, ""));
    if (m) all.push(m[1].trim());
  }
  return { errors: all.slice(0, MAX_ERRORS), truncated: Math.max(0, all.length - MAX_ERRORS) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/job-log.test.ts )`

Expected: PASS — all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/job-log.ts test/job-log.test.ts )`

Expected: both new, unstaged. Do NOT commit.

---

### Task 3: `lib/gh.ts` seam + `toRunDetail` shaping

**Files:**
- Create: `lib/gh.ts`
- Create: `lib/actions.ts`
- Test: `test/actions.test.ts`

**Why a `gh` wrapper exists:** the routes in Task 4 must be unit-testable. Mocking `node:child_process` directly is fragile — `lib/sync.ts` does `promisify(execFile)`, and `promisify` relies on a `util.promisify.custom` symbol that a naive `vi.mock` drops, silently changing the resolved shape from `{stdout, stderr}` to just `stdout`. A thin module seam lets Task 4's tests do `vi.mock("@/lib/gh")` and assert argv directly. `lib/sync.ts` is deliberately **not** refactored to use this — it works, it isn't part of this feature, and changing it would be unrelated churn. The mild duplication of two `execFile` call sites is the intended trade.

**Interfaces:**
- Consumes: nothing.
- Produces:
  - From `@/lib/gh`: `gh(args: string[], opts?: { maxBuffer?: number }): Promise<string>` (returns stdout) and `ghJson<T>(args: string[]): Promise<T>`.
  - From `@/lib/actions`: types `RunJob` (`{ id: number; name: string; status: string; conclusion: string | null; failedStep: string | null }`) and `RunDetail` (`{ name: string; status: string; conclusion: string | null; attempt: number; jobs: RunJob[] }`), plus `toRunDetail(run: GhRun, jobs: GhJob[]): RunDetail` and the raw input types `GhRun` (`{ name: string; status: string; conclusion: string | null; run_attempt: number }`) and `GhJob` (`{ id: number; name: string; status: string; conclusion: string | null; steps?: { name: string; conclusion: string | null }[] }`).

- [ ] **Step 1: Write the failing test**

Create `test/actions.test.ts`. The fixture mirrors the real API response for `magic-onboarding` run `29325766675`:

```ts
import { describe, it, expect } from "vitest";
import { toRunDetail, type GhRun, type GhJob } from "@/lib/actions";

// Shape captured from the real run 29325766675 (workflow "CI").
const RUN: GhRun = { name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 };

const JOBS: GhJob[] = [
  {
    id: 87061580817,
    name: "Lint",
    status: "completed",
    conclusion: "failure",
    steps: [
      { name: "Set up job", conclusion: "success" },
      { name: "Checkout code", conclusion: "success" },
      { name: "golangci-lint", conclusion: "failure" },
      { name: "Post golangci-lint", conclusion: "success" },
    ],
  },
  { id: 2, name: "Test", status: "completed", conclusion: "success", steps: [{ name: "go test", conclusion: "success" }] },
  { id: 3, name: "Build", status: "completed", conclusion: "skipped" },
];

describe("toRunDetail", () => {
  it("maps run meta including the attempt number", () => {
    const d = toRunDetail(RUN, JOBS);
    expect(d).toMatchObject({ name: "CI", status: "completed", conclusion: "failure", attempt: 1 });
  });

  it("keeps every job, not just failing ones", () => {
    expect(toRunDetail(RUN, JOBS).jobs.map((j) => j.name)).toEqual(["Lint", "Test", "Build"]);
  });

  it("pinpoints the failing step of a failed job", () => {
    const lint = toRunDetail(RUN, JOBS).jobs.find((j) => j.id === 87061580817)!;
    expect(lint.failedStep).toBe("golangci-lint");
  });

  it("reports no failing step for a passing job", () => {
    expect(toRunDetail(RUN, JOBS).jobs.find((j) => j.name === "Test")!.failedStep).toBeNull();
  });

  it("tolerates a job with no steps array (skipped jobs omit it)", () => {
    expect(toRunDetail(RUN, JOBS).jobs.find((j) => j.name === "Build")!.failedStep).toBeNull();
  });

  it("preserves job ids so a caller can match the exact job from its url", () => {
    expect(toRunDetail(RUN, JOBS).jobs.map((j) => j.id)).toEqual([87061580817, 2, 3]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/actions.test.ts )`

Expected: FAIL — cannot find module `@/lib/actions`.

- [ ] **Step 3: Write `lib/gh.ts`**

```ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Thin seam over the gh CLI so route handlers stay unit-testable: tests mock
// this module rather than node:child_process (promisify's custom symbol makes
// mocking child_process directly change the resolved shape).
export async function gh(args: string[], opts: { maxBuffer?: number } = {}): Promise<string> {
  const { stdout } = await execFileP("gh", args, { maxBuffer: opts.maxBuffer ?? 1024 * 1024 });
  return stdout;
}

export async function ghJson<T>(args: string[]): Promise<T> {
  return JSON.parse(await gh(args)) as T;
}
```

- [ ] **Step 4: Write `lib/actions.ts`**

```ts
export interface GhRun {
  name: string;
  status: string;
  conclusion: string | null;
  run_attempt: number;
}

export interface GhJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: { name: string; conclusion: string | null }[];
}

export interface RunJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  failedStep: string | null;
}

export interface RunDetail {
  name: string;
  status: string;
  conclusion: string | null;
  attempt: number;
  jobs: RunJob[];
}

// Every job is kept, not just failing ones — seeing that Test passed while Lint
// failed is the point of a pipeline view. `failedStep` is what usually answers
// "what broke" without fetching the log at all.
export function toRunDetail(run: GhRun, jobs: GhJob[]): RunDetail {
  return {
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    attempt: run.run_attempt,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      failedStep: j.steps?.find((s) => s.conclusion === "failure")?.name ?? null,
    })),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/actions.test.ts )`

Expected: PASS — all 6 tests green.

- [ ] **Step 6: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 7: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/gh.ts lib/actions.ts test/actions.test.ts )`

Expected: all three new, unstaged. Do NOT commit.

---

### Task 4: The three API routes

**Files:**
- Create: `app/api/actions/validate.ts`
- Create: `app/api/actions/run/route.ts`
- Create: `app/api/actions/errors/route.ts`
- Create: `app/api/actions/rerun/route.ts`
- Test: `test/api.actions.test.ts`

**Interfaces:**
- Consumes: `gh`, `ghJson` (`@/lib/gh`); `toRunDetail`, `GhRun`, `GhJob`, `RunDetail` (`@/lib/actions`); `extractErrors` (`@/lib/job-log`).
- Produces: three route handlers. `GET /api/actions/run?owner=&repo=&runId=` → `RunDetail`. `GET /api/actions/errors?owner=&repo=&jobId=` → `{ errors: string[]; truncated: number }`. `POST /api/actions/rerun` with body `{ owner, repo, scope: "job", jobId }` | `{ owner, repo, scope: "run-failed" | "run-all", runId }` → `{ ok: true }`.

- [ ] **Step 1: Write the failing test**

Create `test/api.actions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/gh", () => ({ gh: vi.fn(), ghJson: vi.fn() }));
import { gh, ghJson } from "@/lib/gh";
import { GET as runGET } from "@/app/api/actions/run/route";
import { GET as errorsGET } from "@/app/api/actions/errors/route";
import { POST as rerunPOST } from "@/app/api/actions/rerun/route";

const mockGh = vi.mocked(gh);
const mockGhJson = vi.mocked(ghJson);

beforeEach(() => {
  vi.clearAllMocks();
});

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/actions/rerun", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/actions/run", () => {
  it("returns shaped run detail from two gh calls", async () => {
    mockGhJson
      .mockResolvedValueOnce({ name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 })
      .mockResolvedValueOnce({
        jobs: [
          { id: 87061580817, name: "Lint", status: "completed", conclusion: "failure", steps: [{ name: "golangci-lint", conclusion: "failure" }] },
        ],
      });
    const res = await runGET(
      new NextRequest("http://localhost/api/actions/run?owner=acme&repo=magic-onboarding&runId=29325766675"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "CI",
      conclusion: "failure",
      attempt: 1,
      jobs: [{ id: 87061580817, name: "Lint", failedStep: "golangci-lint" }],
    });
    expect(mockGhJson).toHaveBeenNthCalledWith(1, ["api", "repos/acme/magic-onboarding/actions/runs/29325766675"]);
    expect(mockGhJson).toHaveBeenNthCalledWith(2, ["api", "repos/acme/magic-onboarding/actions/runs/29325766675/jobs"]);
  });

  it("rejects a path-traversing repo without calling gh", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=../../orgs/x&runId=1"));
    expect(res.status).toBe(400);
    expect(mockGhJson).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric runId without calling gh", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=abc"));
    expect(res.status).toBe(400);
    expect(mockGhJson).not.toHaveBeenCalled();
  });

  it("returns 502 when gh fails", async () => {
    mockGhJson.mockRejectedValueOnce(new Error("gh: Not Found"));
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=1"));
    expect(res.status).toBe(502);
  });
});

describe("GET /api/actions/errors", () => {
  it("extracts error lines from the fetched log with a large maxBuffer", async () => {
    mockGh.mockResolvedValueOnce("2026-07-14T10:34:38.3855791Z ##[error]totp.go:59:1: File is not properly formatted (golines)");
    const res = await errorsGET(
      new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=magic-onboarding&jobId=87061580817"),
    );
    expect(await res.json()).toEqual({
      errors: ["totp.go:59:1: File is not properly formatted (golines)"],
      truncated: 0,
    });
    expect(mockGh).toHaveBeenCalledWith(
      ["api", "repos/acme/magic-onboarding/actions/jobs/87061580817/logs"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
  });

  it("rejects a bad jobId without calling gh", async () => {
    const res = await errorsGET(new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=api&jobId=x"));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });
});

// These assert the argv that WOULD be sent. No test fires a real re-run.
describe("POST /api/actions/rerun", () => {
  it("builds the single-job rerun path", async () => {
    mockGh.mockResolvedValueOnce("");
    const res = await rerunPOST(post({ owner: "acme", repo: "magic-onboarding", scope: "job", jobId: "87061580817" }));
    expect(res.status).toBe(200);
    expect(mockGh).toHaveBeenCalledWith([
      "api", "-X", "POST", "repos/acme/magic-onboarding/actions/jobs/87061580817/rerun",
    ]);
  });

  it("builds the rerun-failed-jobs path", async () => {
    mockGh.mockResolvedValueOnce("");
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-failed", runId: "29553312321" }));
    expect(mockGh).toHaveBeenCalledWith([
      "api", "-X", "POST", "repos/acme/api/actions/runs/29553312321/rerun-failed-jobs",
    ]);
  });

  it("builds the rerun-all path", async () => {
    mockGh.mockResolvedValueOnce("");
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "29553312321" }));
    expect(mockGh).toHaveBeenCalledWith(["api", "-X", "POST", "repos/acme/api/actions/runs/29553312321/rerun"]);
  });

  it("rejects an unknown scope without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "nuke", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("rejects a path-traversing owner without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "../../x", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("rejects a job-scope body that omits jobId without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "job" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("returns 502 when gh rejects the rerun", async () => {
    mockGh.mockRejectedValueOnce(new Error("gh: HTTP 403"));
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(502);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/api.actions.test.ts )`

Expected: FAIL — cannot find module `@/app/api/actions/run/route`.

- [ ] **Step 3: Write the shared validator**

Create `app/api/actions/validate.ts`:

```ts
// These values are interpolated into a `gh api` path. execFile spawns no shell,
// so there is no shell-injection vector — but an unchecked `repo` such as
// "../../orgs/x" would traverse the API path with a push-scoped token.
const SAFE_NAME = /^[\w.-]+$/;
const SAFE_ID = /^\d+$/;

export function isSafeName(v: string | null): v is string {
  return !!v && SAFE_NAME.test(v);
}

export function isSafeId(v: string | null): v is string {
  return !!v && SAFE_ID.test(v);
}
```

- [ ] **Step 4: Write the run route**

Create `app/api/actions/run/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { ghJson } from "@/lib/gh";
import { toRunDetail, type GhRun, type GhJob } from "@/lib/actions";
import { isSafeName, isSafeId } from "../validate";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const owner = sp.get("owner");
  const repo = sp.get("repo");
  const runId = sp.get("runId");
  if (!isSafeName(owner) || !isSafeName(repo) || !isSafeId(runId)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const base = `repos/${owner}/${repo}/actions/runs/${runId}`;
  try {
    const run = await ghJson<GhRun>(["api", base]);
    const { jobs } = await ghJson<{ jobs: GhJob[] }>(["api", `${base}/jobs`]);
    return NextResponse.json(toRunDetail(run, jobs));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
```

- [ ] **Step 5: Write the errors route**

Create `app/api/actions/errors/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { gh } from "@/lib/gh";
import { extractErrors } from "@/lib/job-log";
import { isSafeName, isSafeId } from "../validate";

// Job logs are unbounded; execFile's 1MB default maxBuffer would error out on a
// verbose job rather than fail diagnosably.
const LOG_MAX_BUFFER = 20 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const owner = sp.get("owner");
  const repo = sp.get("repo");
  const jobId = sp.get("jobId");
  if (!isSafeName(owner) || !isSafeName(repo) || !isSafeId(jobId)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  try {
    const log = await gh(["api", `repos/${owner}/${repo}/actions/jobs/${jobId}/logs`], { maxBuffer: LOG_MAX_BUFFER });
    return NextResponse.json(extractErrors(log));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
```

- [ ] **Step 6: Write the rerun route**

Create `app/api/actions/rerun/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { gh } from "@/lib/gh";
import { isSafeName, isSafeId } from "../validate";

type Body = {
  owner?: string;
  repo?: string;
  scope?: string;
  runId?: string;
  jobId?: string;
};

// Maps 1:1 onto GitHub's own three re-run buttons. Run-scoped by design: a PR's
// failures span multiple runs, and a PR-wide fan-out was deliberately deferred.
function rerunPath(b: Body): string | null {
  const base = `repos/${b.owner}/${b.repo}/actions`;
  if (b.scope === "job") return isSafeId(b.jobId ?? null) ? `${base}/jobs/${b.jobId}/rerun` : null;
  if (b.scope === "run-failed") return isSafeId(b.runId ?? null) ? `${base}/runs/${b.runId}/rerun-failed-jobs` : null;
  if (b.scope === "run-all") return isSafeId(b.runId ?? null) ? `${base}/runs/${b.runId}/rerun` : null;
  return null;
}

export async function POST(req: NextRequest) {
  const b = (await req.json()) as Body;
  if (!isSafeName(b.owner ?? null) || !isSafeName(b.repo ?? null)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const path = rerunPath(b);
  if (!path) return NextResponse.json({ error: "invalid scope" }, { status: 400 });
  try {
    await gh(["api", "-X", "POST", path]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/api.actions.test.ts )`

Expected: PASS — all 13 tests green.

- [ ] **Step 8: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 9: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short app/api/actions test/api.actions.test.ts )`

Expected: all new, unstaged. Do NOT commit.

---

### Task 5: `useRun` and `useJobErrors` hooks

**Files:**
- Create: `hooks/use-run.ts`

**Interfaces:**
- Consumes: `ActionsRef` (`@/lib/actions-url`), `RunDetail` (`@/lib/actions`).
- Produces, from `@/hooks/use-run`:
  - `useRun(ref: ActionsRef | null): { run: RunDetail | undefined; isLoading: boolean; refresh: () => void }`
  - `useJobErrors(ref: ActionsRef | null): { errors: string[]; truncated: number; isLoading: boolean }`

**No test:** these are thin SWR bindings with no logic of their own — the same reason `hooks/use-activity.ts`, `use-item.ts`, and `use-views.ts` have no tests in this project. Their behavior is covered where it matters, through the component tests in Task 7.

- [ ] **Step 1: Write the hooks**

Create `hooks/use-run.ts`:

```ts
"use client";

import useSWR from "swr";
import type { ActionsRef } from "@/lib/actions-url";
import type { RunDetail } from "@/lib/actions";

const fetcher = <T,>(u: string): Promise<T> => fetch(u).then((r) => r.json());

// A null ref means "collapsed" — SWR skips the request entirely, which is how
// run/log detail stays out of the 2-minute sync and off the wire until looked at.
export function useRun(ref: ActionsRef | null) {
  const key = ref ? `/api/actions/run?owner=${ref.owner}&repo=${ref.repo}&runId=${ref.runId}` : null;
  const { data, isLoading, mutate } = useSWR<RunDetail>(key, fetcher);
  return { run: data, isLoading, refresh: () => void mutate() };
}

export function useJobErrors(ref: ActionsRef | null) {
  const key = ref ? `/api/actions/errors?owner=${ref.owner}&repo=${ref.repo}&jobId=${ref.jobId}` : null;
  const { data, isLoading } = useSWR<{ errors: string[]; truncated: number }>(key, fetcher);
  return { errors: data?.errors ?? [], truncated: data?.truncated ?? 0, isLoading };
}
```

- [ ] **Step 2: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 3: Confirm the full suite still passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test )`

Expected: PASS — this task adds no behavior yet; this only confirms nothing broke.

- [ ] **Step 4: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short hooks/use-run.ts )`

Expected: new, unstaged. Do NOT commit.

---

### Task 6: `FailingChecks` — the list, with expansion for actionable checks only

This task builds the list and its toggle behavior. The expanded panel's contents come in Task 7 — here, expanding renders a placeholder so this task is independently testable.

**Files:**
- Create: `components/detail/failing-checks.tsx`
- Modify: `components/detail/pr-row.tsx` (replace the inline failing block, lines 137-157)
- Test: `test/failing-checks.test.tsx`

**Interfaces:**
- Consumes: `parseActionsUrl`, `ActionsRef` (`@/lib/actions-url`).
- Produces: `FailingChecks({ failed }: { failed: { name: string; url: string | null }[] })` from `@/components/detail/failing-checks`.

- [ ] **Step 1: Write the failing test**

Create `test/failing-checks.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FailingChecks } from "@/components/detail/failing-checks";

const JOB_URL = "https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817";
const JOB_URL_2 = "https://github.com/acme/magic-onboarding/actions/runs/29325764261/job/87061573038";
const ARGO_URL = "https://argo.dev.acme.in/workflows/argo-workflows/slit-magic-onboarding-jlhgo?tab=workflow";

describe("FailingChecks", () => {
  it("renders an actionable check as a toggle plus a separate github link", () => {
    render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
    expect(screen.getByRole("button", { name: /Lint/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open Lint on github/i })).toHaveAttribute("href", JOB_URL);
  });

  it("renders a non-actionable check as a plain link with no toggle", () => {
    render(<FailingChecks failed={[{ name: "quality-gate-slit", url: ARGO_URL }]} />);
    expect(screen.getByRole("link", { name: "quality-gate-slit" })).toHaveAttribute("href", ARGO_URL);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains on hover why a non-actionable check has no controls", () => {
    render(<FailingChecks failed={[{ name: "quality-gate-slit", url: ARGO_URL }]} />);
    expect(screen.getByRole("link", { name: "quality-gate-slit" })).toHaveAttribute(
      "title",
      "External check — not re-runnable from deck",
    );
  });

  it("renders a check with no url as plain text", () => {
    render(<FailingChecks failed={[{ name: "BVT Workflow", url: null }]} />);
    expect(screen.getByText("BVT Workflow")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("expands only the clicked check", () => {
    render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "Lint", url: JOB_URL_2 },
        ]}
      />,
    );
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Lint/ })[0]);
    expect(screen.getAllByTestId("run-panel")).toHaveLength(1);
  });

  it("collapses when the expanded check is clicked again", () => {
    render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
    const toggle = screen.getByRole("button", { name: /Lint/ });
    fireEvent.click(toggle);
    expect(screen.getByTestId("run-panel")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
  });

  it("keeps both same-named checks independently expandable with distinct links", () => {
    render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "Lint", url: JOB_URL_2 },
        ]}
      />,
    );
    const links = screen.getAllByRole("link", { name: /open Lint on github/i });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([JOB_URL, JOB_URL_2]);
  });

  it("never nests an anchor inside another anchor", () => {
    const { container } = render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "quality-gate-slit", url: ARGO_URL },
        ]}
      />,
    );
    container.querySelectorAll("a").forEach((a) => expect(a.closest("a")).toBe(a));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/failing-checks.test.tsx )`

Expected: FAIL — cannot find module `@/components/detail/failing-checks`.

- [ ] **Step 3: Create the component**

Create `components/detail/failing-checks.tsx`. `RunPanel` is a placeholder here and is filled in by Task 7:

```tsx
"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { parseActionsUrl, type ActionsRef } from "@/lib/actions-url";

const NAME_CLS = "truncate font-mono text-[11px] text-st-blocked";

function RunPanel({ actionsRef }: { actionsRef: ActionsRef }) {
  return <div data-testid="run-panel" className="mt-1 pl-4 text-[11px] text-text-faint" />;
}

function FailingCheck({ check }: { check: { name: string; url: string | null } }) {
  const [open, setOpen] = useState(false);
  const actionsRef = parseActionsUrl(check.url);

  // Not a GitHub Actions job (Argo, Spinnaker, a bare repo link, a third-party
  // CheckRun): nothing can be re-run or fetched, so it stays exactly as it was
  // — a plain link. The absence of a chevron is the signal; a title explains it
  // on hover rather than adding a label to every such row.
  if (!actionsRef) {
    return check.url ? (
      <a
        href={check.url}
        target="_blank"
        rel="noreferrer"
        title="External check — not re-runnable from deck"
        className={`${NAME_CLS} hover:underline`}
      >
        {check.name}
      </a>
    ) : (
      <span title={check.name} className={NAME_CLS}>
        {check.name}
      </span>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex min-w-0 items-center gap-1 ${NAME_CLS} hover:underline`}
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{check.name}</span>
        </button>
        <a
          href={check.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${check.name} on GitHub`}
          className="shrink-0 text-text-faint transition hover:text-st-blocked"
        >
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      {open && <RunPanel actionsRef={actionsRef} />}
    </div>
  );
}

export function FailingChecks({ failed }: { failed: { name: string; url: string | null }[] }) {
  if (failed.length === 0) return null;
  // relative z-10: must outrank PrRow's stretched-link ::after overlay so these
  // controls stay clickable. Never de-duplicate — two checks can share a name
  // with different urls; keyed by index for that reason.
  return (
    <div className="relative z-10 mt-1.5 flex flex-col gap-0.5 border-l-2 border-st-blocked/35 pl-2.5">
      {failed.map((f, i) => (
        <FailingCheck key={i} check={f} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Wire it into `pr-row.tsx`**

In `components/detail/pr-row.tsx`, add to the imports at the top:

```tsx
import { FailingChecks } from "./failing-checks";
```

Then replace the entire inline failing block (currently lines 137-157, from `{failed.length > 0 && (` through its closing `)}`):

```tsx
        {failed.length > 0 && (
          // relative + z-10: must outrank the id anchor's ::after overlay,
          // which paints above static content by default. Never de-dupe —
          // two checks can share a name (e.g. two Lint runs) with different
          // URLs; keyed by index for that reason.
          <div className="relative z-10 mt-1.5 flex flex-col gap-0.5 border-l-2 border-st-blocked/35 pl-2.5">
            {failed.map((f, i) => {
              const Tag = f.url ? "a" : "span";
              return (
                <Tag
                  key={i}
                  {...(f.url ? { href: f.url, target: "_blank", rel: "noreferrer" } : {})}
                  title={f.name}
                  className={`truncate font-mono text-[11px] text-st-blocked ${f.url ? "hover:underline" : ""}`}
                >
                  {f.name}
                </Tag>
              );
            })}
          </div>
        )}
```

with:

```tsx
        <FailingChecks failed={failed} />
```

- [ ] **Step 5: Run both test files**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/failing-checks.test.tsx test/pr-row.test.tsx )`

Expected: PASS. Note `test/pr-row.test.tsx` has existing tests that assert failing-check rendering through `PrRow` — including the `a a` nesting guard and the two-same-named-`Lint`-links case. Those now exercise `FailingChecks` indirectly and must still pass. **If a pre-existing `pr-row` test now fails because a check name became a `<button>` instead of an `<a>`, STOP and report it** — do not edit the assertion to match; the controller needs to decide, since those URLs (`https://ci/a`) are fixtures that `parseActionsUrl` will correctly reject as non-actionable, so they should still render as plain links.

- [ ] **Step 6: Run the full suite and typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test && npx tsc --noEmit )`

Expected: full suite PASS; no new type errors.

- [ ] **Step 7: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/failing-checks.tsx components/detail/pr-row.tsx test/failing-checks.test.tsx )`

Expected: all present, unstaged. Do NOT commit.

---

### Task 7: `RunPanel` — pipeline, errors, and the three re-run buttons

**Files:**
- Modify: `components/detail/failing-checks.tsx` (replace the `RunPanel` placeholder)
- Test: `test/run-panel.test.tsx`

**Interfaces:**
- Consumes: `useRun`, `useJobErrors` (`@/hooks/use-run`); `ActionsRef` (`@/lib/actions-url`); `RunDetail` (`@/lib/actions`).
- Produces: no new exports — `RunPanel` stays module-private inside `failing-checks.tsx`.

- [ ] **Step 1: Write the failing test**

Create `test/run-panel.test.tsx`. The hooks are mocked so this tests the panel's own logic, not SWR:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FailingChecks } from "@/components/detail/failing-checks";
import type { RunDetail } from "@/lib/actions";

const refresh = vi.fn();
vi.mock("@/hooks/use-run", () => ({
  useRun: vi.fn(),
  useJobErrors: vi.fn(),
}));
import { useRun, useJobErrors } from "@/hooks/use-run";

const JOB_URL = "https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817";

const RUN: RunDetail = {
  name: "CI",
  status: "completed",
  conclusion: "failure",
  attempt: 1,
  jobs: [
    { id: 87061580817, name: "Lint", status: "completed", conclusion: "failure", failedStep: "golangci-lint" },
    { id: 2, name: "Test", status: "completed", conclusion: "success", failedStep: null },
    { id: 3, name: "Build", status: "completed", conclusion: "skipped", failedStep: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRun).mockReturnValue({ run: RUN, isLoading: false, refresh });
  vi.mocked(useJobErrors).mockReturnValue({
    errors: ["totp.go:59:1: File is not properly formatted (golines)"],
    truncated: 0,
    isLoading: false,
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch;
});

function expand() {
  render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
  fireEvent.click(screen.getByRole("button", { name: /Lint/ }));
}

describe("RunPanel pipeline", () => {
  it("shows the run name, conclusion and attempt", () => {
    expand();
    expect(screen.getByText(/CI/)).toBeInTheDocument();
    expect(screen.getByText(/attempt 1/)).toBeInTheDocument();
  });

  it("shows the failing step of this job", () => {
    expand();
    expect(screen.getByText(/golangci-lint/)).toBeInTheDocument();
  });

  it("lists every job, not just the failing one", () => {
    expand();
    expect(screen.getByText(/Test/)).toBeInTheDocument();
    expect(screen.getByText(/Build/)).toBeInTheDocument();
  });

  it("shows the extracted error lines", () => {
    expand();
    expect(screen.getByText("totp.go:59:1: File is not properly formatted (golines)")).toBeInTheDocument();
  });

  it("says so when a log has no error markers", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: [], truncated: 0, isLoading: false });
    expand();
    expect(screen.getByText(/no error markers/i)).toBeInTheDocument();
  });

  it("reports how many errors were truncated", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: ["a"], truncated: 5, isLoading: false });
    expand();
    expect(screen.getByText(/5 more/)).toBeInTheDocument();
  });
});

// No test fires a real re-run: fetch is mocked and only the request is asserted.
describe("RunPanel re-run", () => {
  it("requires confirmation before firing a re-run", async () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run job/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^yes$/i })).toBeInTheDocument();
  });

  it("posts the job scope after confirming", async () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run job/i }));
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("/api/actions/rerun");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "job",
      jobId: "87061580817",
    });
  });

  it("posts the run-failed scope after confirming", async () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run failed/i }));
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "run-failed",
      runId: "29325766675",
    });
  });

  it("posts the run-all scope after confirming", async () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run all/i }));
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "run-all",
      runId: "29325766675",
    });
  });

  it("cancelling the confirm fires nothing", () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run job/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /re-run job/i })).toBeInTheDocument();
  });

  it("refreshes only this run after a successful re-run", async () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run job/i }));
    fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/run-panel.test.tsx )`

Expected: FAIL — the placeholder `RunPanel` renders nothing, so `CI`, `golangci-lint`, and the re-run buttons are all absent.

- [ ] **Step 3: Replace the `RunPanel` placeholder**

In `components/detail/failing-checks.tsx`, update the imports:

```tsx
"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, ExternalLink } from "lucide-react";
import { parseActionsUrl, type ActionsRef } from "@/lib/actions-url";
import { useRun, useJobErrors } from "@/hooks/use-run";
```

Then replace the placeholder `RunPanel` with:

```tsx
type Scope = "job" | "run-failed" | "run-all";

const JOB_MARK: Record<string, string> = {
  failure: "✗",
  success: "✓",
  skipped: "○",
  cancelled: "○",
};

function RerunButton({
  label,
  scope,
  confirming,
  setConfirming,
  onConfirm,
  busy,
}: {
  label: string;
  scope: Scope;
  confirming: Scope | null;
  setConfirming: (s: Scope | null) => void;
  onConfirm: (s: Scope) => void;
  busy: boolean;
}) {
  if (confirming === scope) {
    return (
      <span className="flex items-center gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(scope)}
          className="rounded border border-st-blocked/40 px-1 text-[10px] text-st-blocked transition hover:bg-st-blocked/15 disabled:opacity-50"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          className="rounded border border-hairline px-1 text-[10px] text-text-faint transition hover:text-foreground"
        >
          Cancel
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => setConfirming(scope)}
      className="rounded border border-hairline px-1 text-[10px] text-text-faint transition hover:text-foreground"
    >
      {label}
    </button>
  );
}

function RunPanel({ actionsRef }: { actionsRef: ActionsRef }) {
  const { run, isLoading, refresh } = useRun(actionsRef);
  const { errors, truncated } = useJobErrors(actionsRef);
  const [confirming, setConfirming] = useState<Scope | null>(null);
  const [busy, setBusy] = useState(false);

  async function fire(scope: Scope) {
    setBusy(true);
    const body =
      scope === "job"
        ? { owner: actionsRef.owner, repo: actionsRef.repo, scope, jobId: actionsRef.jobId }
        : { owner: actionsRef.owner, repo: actionsRef.repo, scope, runId: actionsRef.runId };
    try {
      await fetch("/api/actions/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      // Refetch just this run — it comes back queued. A full sync would re-hit
      // every PR for one button press.
      refresh();
    } finally {
      setBusy(false);
      setConfirming(null);
    }
  }

  if (isLoading && !run) {
    return (
      <div data-testid="run-panel" className="mt-1 pl-4 text-[10.5px] text-text-faint">
        loading pipeline…
      </div>
    );
  }
  if (!run) {
    return (
      <div data-testid="run-panel" className="mt-1 pl-4 text-[10.5px] text-text-faint">
        couldn&apos;t load this run
      </div>
    );
  }

  const job = run.jobs.find((j) => String(j.id) === actionsRef.jobId);

  return (
    <div data-testid="run-panel" className="mt-1 flex flex-col gap-1 pl-4">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-text-faint">
        <span className="text-muted-foreground">{run.name}</span>
        <span aria-hidden="true">·</span>
        <span className={run.conclusion === "failure" ? "text-st-blocked" : ""}>{run.conclusion ?? run.status}</span>
        <span aria-hidden="true">·</span>
        <span>attempt {run.attempt}</span>
        <span className="ml-auto flex items-center gap-1">
          <RerunButton label="re-run failed" scope="run-failed" confirming={confirming} setConfirming={setConfirming} onConfirm={fire} busy={busy} />
          <RerunButton label="re-run all" scope="run-all" confirming={confirming} setConfirming={setConfirming} onConfirm={fire} busy={busy} />
        </span>
      </div>

      {job?.failedStep && (
        <div className="flex items-center gap-1.5 text-[10.5px] text-text-faint">
          <span>
            failed at <span className="font-mono text-st-blocked">{job.failedStep}</span>
          </span>
          <span className="ml-auto">
            <RerunButton label="re-run job" scope="job" confirming={confirming} setConfirming={setConfirming} onConfirm={fire} busy={busy} />
          </span>
        </div>
      )}

      {errors.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          {errors.map((e, i) => (
            <span key={i} title={e} className="truncate font-mono text-[10.5px] text-st-blocked">
              {e}
            </span>
          ))}
          {truncated > 0 && <span className="text-[10.5px] text-text-faint">…and {truncated} more</span>}
        </div>
      ) : (
        <span className="text-[10.5px] text-text-faint">No error markers in this log — open the job on GitHub</span>
      )}

      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-text-faint">
        {run.jobs.map((j) => (
          <span key={j.id} className={j.conclusion === "failure" ? "text-st-blocked" : ""}>
            {JOB_MARK[j.conclusion ?? ""] ?? "·"} {j.name}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/run-panel.test.tsx )`

Expected: PASS — all 12 tests green.

- [ ] **Step 5: Run the full suite, typecheck, lint and build**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test && npx tsc --noEmit && npm run lint && npm run build )`

Expected: all clean. The build matters here — it's what fully parses the new JSX and route handlers.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short )`

Expected: everything present, nothing staged. Do NOT commit.

---

### Task 8: Live verification (includes the one deliberate re-run)

Unit tests prove the argv; they cannot prove GitHub accepts it. This project's known failure mode is tests passing while the real thing is broken, and this feature additionally has an unproven permission (`actions: write`).

**Files:** none — verification only.

- [ ] **Step 1: Start the dev server and confirm it's up**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm run dev )` if not already running, then:

`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`

Expected: `200`.

- [ ] **Step 2: Verify the run route against a real run (read-only)**

```bash
curl -s "http://localhost:3000/api/actions/run?owner=acme&repo=magic-onboarding&runId=29325766675" | head -c 600
```

Expected: JSON with `"name":"CI"`, `"conclusion":"failure"`, `"attempt":1`, and a `jobs` array containing `Lint` with `"failedStep":"golangci-lint"`. If `attempt` has climbed above 1, someone re-ran it since — that's fine.

- [ ] **Step 3: Verify the errors route against the real failing job (read-only)**

```bash
curl -s "http://localhost:3000/api/actions/errors?owner=acme&repo=magic-onboarding&jobId=87061580817"
```

Expected: `errors` containing the golangci-lint violations (`totp.go:59:1: File is not properly formatted (golines)` etc.), `truncated: 0`, and **no** Node-deprecation warning.

- [ ] **Step 4: Verify the validation guard rejects traversal (read-only)**

```bash
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/api/actions/run?owner=acme&repo=../../orgs/x&runId=1"
```

Expected: `400`.

- [ ] **Step 5: Verify the UI in the browser**

Open `http://localhost:3000`, open the `1CC auth-configs decomp` item (9 PRs — it has both actionable and non-actionable failures), and confirm:

- `Lint`-style Actions failures show a chevron toggle plus a separate ↗ icon; `quality-gate-slit` / `BVT Workflow` / `github/combined-status-check` show **no chevron** and keep their plain link, with the "External check — not re-runnable from deck" tooltip on hover.
- Expanding an actionable check shows the run line (`CI · failure · attempt 1`), the failing step, the extracted error lines, and the job list with passing/skipped siblings.
- Only one check expands at a time; collapsing works.
- Nothing is requested until you expand (watch the dev-server log or the browser Network tab — no `/api/actions/*` calls on page load).
- The browser console is clean: no hydration warnings, no `validateDOMNesting` nested-anchor warnings. Verify on a fresh tab, not a `location.reload()`.

- [ ] **Step 6: THE ONE REAL RE-RUN — get explicit human go-ahead first**

This is the only step that spends real CI. **Do not perform it autonomously.** Ask the developer to pick one of their own PRs and confirm, then:

Click `re-run job` on a real failing Actions check → confirm `Yes` → observe that:
1. The POST returns 200 (proving `actions: write` works with a `push`-scoped token — the spec's one unproven assumption).
2. The panel refreshes and the run's status flips to `queued` / `in_progress`.
3. GitHub's own UI for that run shows a new attempt.

If it returns 502 with an HTTP 403, the token lacks `actions: write` — report that; it invalidates the feature's core premise and needs a decision, not a workaround.

- [ ] **Step 7: Confirm everything is unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short && git diff --cached --name-only | wc -l )`

Expected: all changes present and unstaged; staged count `0`. Do NOT commit.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §1 `parseActionsUrl`, null = not actionable, no data-model change | 1 |
| §2 `lib/gh.ts` seam + three routes + argv mapping | 3, 4 |
| §2 Argument validation (`SAFE_NAME`/`SAFE_ID`, 400 before `execFile`) | 4 |
| §2 `maxBuffer: 20MB` on the log fetch | 4 |
| §3 `extractErrors`, timestamp stripping, `MAX_ERRORS=20`, no-marker fallback | 2, 7 |
| §4 Expander placement, chevron only for actionable, tooltip for external | 6 |
| §4 Component boundary (`failing-checks.tsx` out of `pr-row.tsx`) | 6 |
| §4 Stacking (`relative z-10`), `a a` guard still passing | 6 |
| §4 Inline confirm; refetch only that run on success | 7 |
| §5 Data flow end-to-end | 6, 7, 8 |
| §6 All listed tests | 1, 2, 3, 4, 6, 7 |
| §7 Risks: no test fires a re-run; `actions: write` proven once, by a human | 4, 7, 8 |

**Deviations from the spec, deliberate:**
1. **`lib/gh.ts` was not in the spec.** It exists so Task 4's routes are testable without mocking `node:child_process` (whose `promisify.custom` symbol a naive mock drops, silently changing the resolved shape). `lib/sync.ts` is intentionally left on its own `execFile` — it isn't part of this feature. Rationale documented in Task 3.
2. **`toRunDetail` and `RunJob.id` weren't specified.** The id is needed because a PR can have two same-named jobs (`Lint` ×2) in different runs — matching by name would pick the wrong one. Matching on `jobId` from the URL is exact.
3. **`hooks/use-run.ts` has no dedicated test**, matching every other hook in this project. Its behavior is covered via the mocked-hook component tests in Task 7.

**Placeholder scan:** none — every code step contains complete, runnable code. The Task 6 `RunPanel` stub is an intentional, working placeholder that Task 7 replaces, not a "TODO".

**Type consistency:** `ActionsRef` (Task 1) is consumed identically in Tasks 4-7. `RunDetail`/`RunJob`/`GhRun`/`GhJob` (Task 3) match the route in Task 4, the hook in Task 5, and the panel in Task 7. `extractErrors`'s `{errors, truncated}` (Task 2) matches the errors route (Task 4), `useJobErrors` (Task 5), and the panel (Task 7). The three `scope` strings (`"job"`, `"run-failed"`, `"run-all"`) are identical in Task 4's route, Task 7's `Scope` type, and both tasks' tests.
