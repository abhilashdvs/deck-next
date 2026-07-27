# Detail Sheet UX Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the detail sheet's clutter — checks trapped inside real PR cards instead of floating below them, one skimmable meta line instead of four coloured pills, no more duplicate conflict spam in the activity log, and less permanent whitespace above the PR list.

**Architecture:** A structural rewrite of `pr-row.tsx` (stretched-link pattern: the PR id becomes the only real `<a>`, with an invisible full-card `::after` overlay, so failing-check links can live inside the card as real DOM children instead of a detached sibling block) plus two small, independent bug fixes in the sync/import data layer, plus two extractions out of the 417-line `detail-sheet.tsx` to host new collapse-state UI without growing that file further.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Drizzle ORM + better-sqlite3, Vitest + @testing-library/react, lucide-react icons.

## Global Constraints

- **NEVER commit or stage.** Every edit stays unstaged in the working tree — the developer reviews and commits manually. Do not run `git add`, `git commit`, `git push`, or `git stash`.
- **Working directory:** `/Users/dontula.abhilash/Documents/onlymagic/deck-next`. Bash `cd` throws `GVM_ROOT not set` — use a subshell: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; <cmd> )`.
- **No denominators in check counts** (carried over from the prior feature — `required` counts checks that have *reported*, not the configured total). This design doesn't add new denominators; don't reintroduce one.
- **Never de-duplicate `failed[]`** — two required checks can share a name (e.g. two `Lint` runs) with different URLs; both must render, keyed by array index.
- **Stretched-link stacking rule** (the load-bearing CSS of this whole plan): the *outer card* gets `position: relative`. The id `<a>` itself stays `position: static` — only its `::after` pseudo-element gets `absolute inset-0`, so it sizes to the card (the nearest positioned ancestor), not to the anchor's own small text box. Anything else inside the card that must remain independently clickable (failing-check links, the PR-group hover overlay) needs its own `position: relative` (or is already `absolute`) plus an explicit `z-index` greater than the overlay's implicit `auto` (0) — use `z-10` for in-flow elements, `z-20` for the already-`absolute` hover overlay. Do **not** put `relative` or `z-10` on the id anchor itself — that would make its `::after` size to the anchor, not the card, defeating the whole pattern.
- **Meta-line wording** (replaces the old pill text): `"merged"`, `"closed"`, `"conflicts"`, `"N checks failing"`, `"N checks pending"`, `"checks passing"` (icon + neutral text, not `"✓ required passing"`), `"approved"` (icon + neutral text), `"changes requested"`, `"review"`, `"N unresolved"`, `"open"` / `"draft"`. No `✓`/`✗`/`⋯` glyphs in the meta line itself (those were the old pill markers); the border-left colour on the failing-check block is the only marker needed there.
- Test command for one file: `npx vitest run <file>`. Full suite: `npm test`.

---

### Task 1: Stop GitHub's `UNKNOWN` mergeable from clobbering the last known value

**Files:**
- Modify: `lib/sync.ts:10-31` (the `normalizePr` function)
- Test: `test/sync.test.ts:20-22` (update one existing test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `normalizePr(d)` now returns `{ state: string; mergeable: string | undefined; commentsCount: number }` — `mergeable` is `undefined` (not the string `"unknown"`) when GitHub's value isn't `MERGEABLE` or `CONFLICTING`. No caller signature changes: `ImportRecord.mergeable` (`lib/types.ts:127`) is already `mergeable?: string`, and `updateSource` (`lib/model/sources.ts:92-94`) already skips writing any field that is `undefined` — this task changes nothing downstream, it only stops writing a value that used to overwrite a real one.

- [ ] **Step 1: Write the failing test**

Open `test/sync.test.ts`. Replace the existing test at lines 20-22:

```ts
  it("defaults unknown mergeable", () => {
    expect(normalizePr({ state: "OPEN" }).mergeable).toBe("unknown");
  });
```

with:

```ts
  // GitHub returns UNKNOWN while it's still computing the merge commit — this
  // is "ask again later", not a real state change. Returning undefined (not
  // the string "unknown") lets updateSource's existing `!== undefined` guard
  // preserve whatever mergeable value was already stored, instead of
  // clobbering a real "conflicting" with a transient "unknown" every sync.
  it("returns undefined mergeable when GitHub hasn't computed it yet, so the last known value survives", () => {
    expect(normalizePr({ state: "OPEN" }).mergeable).toBeUndefined();
    expect(normalizePr({ state: "OPEN", mergeable: "UNKNOWN" }).mergeable).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/sync.test.ts )`

Expected: FAIL — `expected 'unknown' to be undefined`.

- [ ] **Step 3: Fix `normalizePr`**

In `lib/sync.ts`, change the function's return type and the `mergeable` line (lines 17 and 26):

```ts
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
```

- [ ] **Step 4: Run the full sync test file to verify pass and no regressions**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/sync.test.ts )`

Expected: PASS — all `normalizePr` and `normalizeChecks` tests green, including the `"maps CONFLICTING mergeable to conflicting"` test (unchanged behavior).

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors from `lib/sync.ts` or `test/sync.test.ts`.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/sync.ts test/sync.test.ts )`

Expected: both show modified, unstaged. Do NOT commit.

---

### Task 2: Never log a `pr_conflict` for a merged or closed PR

**Files:**
- Modify: `lib/model/import.ts:52-54`
- Test: `test/model.import.test.ts` (append)

**Interfaces:**
- Consumes: `listActivity(db, itemId)` from `@/lib/model/activity` — `(db: DrizzleDb, itemId: number, limit?: number) => Activity[]`, each `Activity` has `.type: ActivityType` and `.summary: string`.
- Produces: nothing new exported; `importSources` behavior only.

- [ ] **Step 1: Write the failing test**

Append to `test/model.import.test.ts`. Add `listActivity` to the existing import line at the top of the file (currently `import { listItems, getItem, updateItem } from "@/lib/model/items";`) by adding a new import line beneath it:

```ts
import { listActivity } from "@/lib/model/activity";
```

Then append this test at the end of the file:

```ts
it("does not log a conflict when a merged PR's mergeable flips to conflicting", () => {
  importSources(db, [base()]);
  const id = listItems(db)[0].id;
  importSources(db, [base({ state: "merged", mergeable: "conflicting" })]);
  const conflicts = listActivity(db, id).filter((a) => a.type === "pr_conflict");
  expect(conflicts).toHaveLength(0);
});

it("still logs a conflict for a live (non-merged) PR", () => {
  importSources(db, [base()]);
  const id = listItems(db)[0].id;
  importSources(db, [base({ state: "open", mergeable: "conflicting" })]);
  const conflicts = listActivity(db, id).filter((a) => a.type === "pr_conflict");
  expect(conflicts).toHaveLength(1);
  expect(conflicts[0].summary).toBe("Conflicts on api #66682");
});
```

- [ ] **Step 2: Run the tests to verify the first one fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/model.import.test.ts )`

Expected: the new "does not log a conflict when a merged PR..." test FAILS (`expected length 1 to be 0`); the "still logs a conflict for a live PR" test already PASSES (it exercises existing behavior).

- [ ] **Step 3: Add the guard**

In `lib/model/import.ts`, replace lines 52-54:

```ts
        if (existing.mergeable !== "conflicting" && rec.mergeable === "conflicting") {
          logActivity(tx, itemId, "pr_conflict", `Conflicts on ${label}`);
        }
```

with:

```ts
        // A merged/closed PR's mergeable value is moot — GitHub often reports
        // stale data post-merge — so it should never trigger a fresh conflict
        // notification.
        const isLive = (rec.state ?? "").toLowerCase() !== "merged" && (rec.state ?? "").toLowerCase() !== "closed";
        if (isLive && existing.mergeable !== "conflicting" && rec.mergeable === "conflicting") {
          logActivity(tx, itemId, "pr_conflict", `Conflicts on ${label}`);
        }
```

- [ ] **Step 4: Run the tests to verify both pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/model.import.test.ts )`

Expected: PASS — all tests in the file green, including the two new ones and the pre-existing 6.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short lib/model/import.ts test/model.import.test.ts )`

Expected: both modified, unstaged. Do NOT commit.

---

### Task 3: One-time purge script for existing duplicate `pr_conflict` rows

**Files:**
- Create: `scripts/purge-duplicate-conflicts.mjs`
- Test: `test/purge-duplicate-conflicts.test.ts`

**Interfaces:**
- Consumes: `better-sqlite3` directly (already a project dependency — see `lib/db.ts:1`), not Drizzle. This is a standalone maintenance script, not application code, so it doesn't import from `@/lib/*`.
- Produces: an exported pure SQL string `PURGE_SQL` the test can run against a fixture DB, plus a `main()` that only runs when the script is executed directly (not when imported by the test).

- [ ] **Step 1: Write the failing test**

Create `test/purge-duplicate-conflicts.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { PURGE_SQL } from "../scripts/purge-duplicate-conflicts.mjs";

let db: InstanceType<typeof Database>;

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`
    CREATE TABLE activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      summary TEXT NOT NULL,
      data TEXT,
      created_at TEXT NOT NULL
    );
  `);
});

function insert(itemId: number, type: string, summary: string, createdAt: string) {
  db.prepare("INSERT INTO activity (item_id, type, summary, data, created_at) VALUES (?, ?, ?, NULL, ?)").run(
    itemId,
    type,
    summary,
    createdAt,
  );
}

it("keeps only the newest pr_conflict row per item and summary", () => {
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-14T20:53:42.106Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-15T10:00:00.000Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3189", "2026-07-16T14:55:33.145Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3096", "2026-07-14T10:00:00.000Z");
  insert(1, "pr_conflict", "Conflicts on magic-checkout-service #3096", "2026-07-15T10:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT summary, created_at FROM activity ORDER BY summary").all() as {
    summary: string;
    created_at: string;
  }[];
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ summary: "Conflicts on magic-checkout-service #3096", created_at: "2026-07-15T10:00:00.000Z" });
  expect(rows[1]).toMatchObject({ summary: "Conflicts on magic-checkout-service #3189", created_at: "2026-07-16T14:55:33.145Z" });
});

it("leaves other activity types and single conflict rows untouched", () => {
  insert(1, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");
  insert(1, "status", "Moved to in_review", "2026-07-14T11:00:00.000Z");
  insert(1, "pr_merged", "Merged api #66682", "2026-07-14T12:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT type FROM activity ORDER BY id").all() as { type: string }[];
  expect(rows.map((r) => r.type)).toEqual(["pr_conflict", "status", "pr_merged"]);
});

it("keeps duplicate rows across different items separate", () => {
  insert(1, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");
  insert(2, "pr_conflict", "Conflicts on api #66682", "2026-07-14T10:00:00.000Z");

  db.exec(PURGE_SQL);

  const rows = db.prepare("SELECT item_id FROM activity").all() as { item_id: number }[];
  expect(rows).toHaveLength(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/purge-duplicate-conflicts.test.ts )`

Expected: FAIL — cannot find module `../scripts/purge-duplicate-conflicts.mjs`.

- [ ] **Step 3: Write the script**

Create `scripts/purge-duplicate-conflicts.mjs`:

```js
import Database from "better-sqlite3";

// One-time cleanup for the duplicate pr_conflict rows produced by the
// UNKNOWN-mergeable bug fixed in lib/sync.ts's normalizePr (see
// docs/superpowers/specs/2026-07-16-detail-sheet-ux-rework-design.md).
// Keeps only the newest pr_conflict row per (item_id, summary) pair;
// every other activity row is untouched.
export const PURGE_SQL = `
  DELETE FROM activity
  WHERE type = 'pr_conflict'
    AND id NOT IN (
      SELECT MAX(id) FROM activity WHERE type = 'pr_conflict' GROUP BY item_id, summary
    );
`;

function main() {
  const dbPath = process.argv[2] ?? "deck.db";
  console.log(`Purging duplicate pr_conflict rows from ${dbPath}`);
  console.log("Make sure you have backed up this file first (cp deck.db deck.db.bak) — this is destructive.");
  const db = new Database(dbPath);
  const before = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'pr_conflict'").get().n;
  db.exec(PURGE_SQL);
  const after = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'pr_conflict'").get().n;
  console.log(`pr_conflict rows: ${before} -> ${after} (removed ${before - after})`);
  db.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/purge-duplicate-conflicts.test.ts )`

Expected: PASS — all 3 tests green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors. (`.mjs` files aren't type-checked by `tsc` under this project's config; this step confirms the new `.ts` test file itself is clean.)

- [ ] **Step 6: Do NOT run the script against the real `deck.db` yet**

This task only creates and tests the script. Running it against the live database happens in Task 8 (live verification), after a manual backup, per the Global Constraints and this project's norm of confirming before destructive DB operations.

- [ ] **Step 7: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short scripts/ test/purge-duplicate-conflicts.test.ts )`

Expected: both untracked/new, unstaged. Do NOT commit.

---

### Task 4: Rewrite `pr-row.tsx` — stretched-link structure, meta line, nested failing checks, target abbreviation

This is the core of the redesign. Read `docs/superpowers/specs/2026-07-16-detail-sheet-ux-rework-design.md` section 1 for the full rationale if anything below is unclear.

**Files:**
- Modify: `components/detail/pr-row.tsx` (full rewrite)
- Test: `test/pr-row.test.tsx` (full rewrite)

**Interfaces:**
- Consumes: `sourceUrl`, `isMergedState`, `prChecks` from `@/lib/pr` (unchanged, already exist). `LinkedSource`, `PrChecks` from `@/lib/types` (unchanged).
- Produces: `PrRow({ src }: { src: LinkedSource })` — same exported signature as before, so `pr-group.tsx` (Task 6) and `detail-sheet.tsx` (Task 7) need no interface changes, only the internal DOM structure changes.

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `test/pr-row.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrRow } from "@/components/detail/pr-row";
import type { LinkedSource } from "@/lib/types";

const src = (o: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 1,
  itemId: 1,
  kind: "github_pr",
  externalId: "api#66682",
  repo: "api",
  number: 66682,
  url: null,
  title: "Dual-write, read-shift",
  state: "open",
  role: "base",
  targetBranch: "master",
  stackedOn: null,
  mergeOrder: 7,
  mergeable: null,
  commentsCount: null,
  unresolvedThreads: null,
  meta: null,
  lastSyncedAt: null,
  ...o,
});

describe("PrRow structure", () => {
  it("shows repo #number and target", () => {
    render(<PrRow src={src()} />);
    expect(screen.getByText("api #66682")).toBeInTheDocument();
    expect(screen.getByText("→ master")).toBeInTheDocument();
  });

  it("renders the id as a link to the PR when a url is resolvable", () => {
    render(<PrRow src={src({ url: "https://github.com/acme/api/pull/66682" })} />);
    expect(screen.getByRole("link", { name: "api #66682" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/66682",
    );
  });

  it("renders the id as plain text when no url is resolvable", () => {
    render(<PrRow src={src({ url: null, kind: "url" as LinkedSource["kind"], repo: null, number: null })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never nests an anchor inside another anchor (stretched-link regression guard)", () => {
    const { container } = render(
      <PrRow
        src={src({
          meta: {
            checks: {
              required: 2,
              passing: 0,
              failing: 2,
              pending: 0,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "Lint", url: "https://ci/b" },
              ],
            },
          },
        })}
      />,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBeGreaterThan(1);
    anchors.forEach((a) => expect(a.closest("a")).toBe(a));
  });
});

describe("PrRow meta line", () => {
  it("shows an open fallback when there is no other signal", () => {
    render(<PrRow src={src()} />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("shows draft instead of open for a draft PR", () => {
    render(<PrRow src={src({ state: "draft" })} />);
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows merged for a merged PR", () => {
    render(<PrRow src={src({ state: "merged" })} />);
    expect(screen.getByText("merged")).toBeInTheDocument();
  });

  it("shows conflicts when mergeable is conflicting", () => {
    render(<PrRow src={src({ mergeable: "conflicting" })} />);
    expect(screen.getByText("conflicts")).toBeInTheDocument();
  });

  it("shows N unresolved", () => {
    render(<PrRow src={src({ unresolvedThreads: 3 })} />);
    expect(screen.getByText("3 unresolved")).toBeInTheDocument();
  });

  it("shows approved for an approved review, without the old checkmark-prefixed text", () => {
    render(<PrRow src={src({ meta: { review: "approved" } })} />);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByText("✓ approved")).not.toBeInTheDocument();
  });

  it("shows changes requested for a changes-requested review", () => {
    render(<PrRow src={src({ meta: { review: "changes_requested" } })} />);
    expect(screen.getByText("changes requested")).toBeInTheDocument();
  });

  it("shows review for a review-required review", () => {
    render(<PrRow src={src({ meta: { review: "review_required" } })} />);
    expect(screen.getByText("review")).toBeInTheDocument();
  });
});

const checks = (o = {}) => ({ required: 9, passing: 9, failing: 0, pending: 0, failed: [], ...o });

describe("PrRow required checks", () => {
  it("shows a checks-failing summary and links each failing check inside the card", () => {
    const { container } = render(
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
    expect(screen.getByText("2 checks failing")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "quality-gate-slit" });
    expect(link).toHaveAttribute("href", "https://ci/b");
    // The failing-check link must be a descendant of the same card, not a
    // detached sibling block below it.
    expect(container.firstElementChild?.contains(link)).toBe(true);
  });

  it("renders both entries when two failing checks share a name, each with its own link", () => {
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
    const links = screen.getAllByRole("link", { name: "Lint" });
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["https://ci/a", "https://ci/b"]);
  });

  it("shows a checks-pending summary when nothing is failing yet", () => {
    render(<PrRow src={src({ meta: { checks: checks({ passing: 1, pending: 2 }) } })} />);
    expect(screen.getByText("2 checks pending")).toBeInTheDocument();
  });

  it("shows checks passing with no denominator", () => {
    render(<PrRow src={src({ meta: { checks: checks() } })} />);
    expect(screen.getByText("checks passing")).toBeInTheDocument();
    expect(screen.queryByText(/9\/9/)).not.toBeInTheDocument();
  });

  it("shows nothing checks-related when no required checks reported", () => {
    render(<PrRow src={src({ meta: { checks: checks({ required: 0, passing: 0 }) } })} />);
    expect(screen.queryByText(/checks (failing|pending|passing)/)).not.toBeInTheDocument();
  });

  it("suppresses checks entirely on a merged PR", () => {
    render(
      <PrRow
        src={src({
          state: "merged",
          meta: { checks: checks({ failing: 3, failed: [{ name: "Lint", url: "https://ci/a" }] }) },
        })}
      />,
    );
    expect(screen.queryByText(/checks failing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lint" })).not.toBeInTheDocument();
  });

  it("renders a failing check without a url as plain text, titled with its full name", () => {
    render(
      <PrRow src={src({ meta: { checks: checks({ failing: 1, failed: [{ name: "BVT Workflow", url: null }] }) } })} />,
    );
    const el = screen.getByText("BVT Workflow");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("title", "BVT Workflow");
    expect(screen.queryByRole("link", { name: "BVT Workflow" })).not.toBeInTheDocument();
  });
});

describe("PrRow target abbreviation", () => {
  it("abbreviates a same-repo stacked target to just the PR number", () => {
    render(<PrRow src={src({ repo: "api", stackedOn: "api#66682", targetBranch: "api#66682" })} />);
    expect(screen.getByText("→ #66682")).toBeInTheDocument();
    expect(screen.queryByText("→ api#66682")).not.toBeInTheDocument();
  });

  it("shows the full label for a cross-repo stacked target", () => {
    render(<PrRow src={src({ repo: "terminals", stackedOn: "api#66682", targetBranch: "api#66682" })} />);
    expect(screen.getByText("→ api#66682")).toBeInTheDocument();
  });

  it("falls back to targetBranch when stackedOn is unset", () => {
    render(<PrRow src={src({ stackedOn: null, targetBranch: "master" })} />);
    expect(screen.getByText("→ master")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-row.test.tsx )`

Expected: FAIL — most tests fail because the current component still renders the old pill text (`"✓ approved"` instead of `"approved"`, etc.) and the old sibling-block chip structure.

- [ ] **Step 3: Replace `components/detail/pr-row.tsx` entirely**

```tsx
"use client";

import type { LinkedSource, PrChecks } from "@/lib/types";
import { sourceUrl, isMergedState, prChecks } from "@/lib/pr";
import { Check } from "lucide-react";

// Checks on a merged or closed PR no longer gate anything, so they're hidden.
function liveChecks(src: LinkedSource): PrChecks | null {
  if (isMergedState(src.state)) return null;
  const c = prChecks(src);
  return c && c.required > 0 ? c : null;
}

type MetaCls = "muted" | "crit" | "rev" | "done";
type MetaItem = { text: string; cls: MetaCls; icon?: boolean };

const META_CLS: Record<MetaCls, string> = {
  muted: "text-text-faint",
  crit: "text-st-blocked",
  rev: "text-st-review",
  done: "text-st-done",
};

// One skimmable line instead of a wall of coloured pills. Colour is reserved
// for whichever fact most needs attention; "passing"/"approved" get a small
// checkmark icon instead of coloured text, so a good outcome doesn't compete
// visually with a problem one.
function metaItems(src: LinkedSource): MetaItem[] {
  const items: MetaItem[] = [];
  const state = (src.state ?? "").toLowerCase();

  if (state === "merged") items.push({ text: "merged", cls: "done" });
  else if (state === "closed") items.push({ text: "closed", cls: "muted" });

  if (src.mergeable === "conflicting") items.push({ text: "conflicts", cls: "crit" });

  const checks = liveChecks(src);
  if (checks) {
    if (checks.failing > 0) items.push({ text: `${checks.failing} checks failing`, cls: "crit" });
    else if (checks.pending > 0) items.push({ text: `${checks.pending} checks pending`, cls: "rev" });
    else items.push({ text: "checks passing", cls: "done", icon: true });
  }

  const meta = (src.meta ?? {}) as Record<string, unknown>;
  const review = String(meta.review ?? "").toLowerCase();
  if (review.includes("chang")) items.push({ text: "changes requested", cls: "crit" });
  else if (review.includes("approv")) items.push({ text: "approved", cls: "done", icon: true });
  else if (review.includes("requir")) items.push({ text: "review", cls: "muted" });

  if (items.length === 0) items.push({ text: state === "draft" ? "draft" : "open", cls: "muted" });

  if ((src.unresolvedThreads ?? 0) > 0) {
    const isOnlySignal = items.length === 1 && items[0].cls === "muted";
    items.push({ text: `${src.unresolvedThreads} unresolved`, cls: isOnlySignal ? "rev" : "muted" });
  }

  return items;
}

// Same-repo stacked target abbreviates to just the PR number; cross-repo or
// unstacked PRs show the full label. `stackedOn` isn't collected by the add
// PR UI yet, so this falls back to the existing targetBranch string until it
// is — the abbreviation activates automatically once it lands.
function targetLabel(src: LinkedSource): string | null {
  if (src.stackedOn) {
    const [repo, num] = src.stackedOn.split("#");
    return repo === src.repo ? `→ #${num}` : `→ ${src.stackedOn}`;
  }
  return src.targetBranch ? `→ ${src.targetBranch}` : null;
}

export function PrRow({ src }: { src: LinkedSource }) {
  const url = sourceUrl(src);
  const st = (src.state ?? "").toLowerCase();
  const pip = isMergedState(src.state)
    ? "var(--st-done)"
    : st === "draft"
      ? "var(--text-faint)"
      : "var(--st-progress)";
  const idText = src.repo ? `${src.repo}${src.number ? ` #${src.number}` : ""}` : src.externalId || src.kind;
  const items = metaItems(src);
  const failed = liveChecks(src)?.failed ?? [];
  const target = targetLabel(src);

  return (
    <div
      className={`relative flex gap-3 rounded-[10px] border border-hairline bg-card p-2.5 ${url ? "transition hover:bg-card-hover" : ""}`}
    >
      {src.mergeOrder != null && (
        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-hairline text-[10.5px] text-muted-foreground">
          {src.mergeOrder}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ background: pip }} />
          {url ? (
            // Stretched link: the anchor itself stays position:static so its
            // ::after (absolute + inset-0) sizes to the nearest *positioned*
            // ancestor — the card div above, which is `relative` — covering
            // the whole card as an invisible click target. Do not add
            // `relative` to this anchor: that would make ::after size to the
            // anchor's own small text box instead.
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[12px] text-foreground after:absolute after:inset-0 after:content-['']"
            >
              {idText}
            </a>
          ) : (
            <span className="font-mono text-[12px] text-foreground">{idText}</span>
          )}
          {target && (
            <span className="ml-auto shrink-0 font-mono text-[10.5px] text-text-faint" title={target}>
              {target}
            </span>
          )}
        </div>
        {src.title && <div className="mt-1 truncate text-[11.5px] text-muted-foreground">{src.title}</div>}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
          {items.map((item, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && (
                <span className="text-text-faint" aria-hidden="true">
                  ·
                </span>
              )}
              <span className="flex items-center gap-1">
                {item.icon && <Check className="size-3 text-st-done" aria-hidden="true" />}
                <span className={META_CLS[item.cls]}>{item.text}</span>
              </span>
            </span>
          ))}
        </div>
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
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-row.test.tsx )`

Expected: PASS — all tests across the four `describe` blocks green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors from `pr-row.tsx` or its test.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/pr-row.tsx test/pr-row.test.tsx )`

Expected: both modified, unstaged. Do NOT commit.

---

### Task 5: Extract `item-fields.tsx` with the empty-field collapse

**Files:**
- Create: `components/detail/item-fields.tsx`
- Test: `test/item-fields.test.tsx`

**Interfaces:**
- Consumes: `EditableText` from `./editable-text`, `TagInput` from `./tag-input`, `NotesEditor` from `./notes-editor` — all unchanged, existing components.
- Produces: `ItemFields({ item, onPatch }: { item: ItemDetail; onPatch: (patch: Record<string, unknown>) => void })`. Task 7 renders `<ItemFields item={item} onPatch={patchItem} />` in place of `detail-sheet.tsx`'s current next-action/blocked-reason/tags/notes block.

- [ ] **Step 1: Write the failing test**

Create `test/item-fields.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemFields } from "@/components/detail/item-fields";
import type { ItemDetail } from "@/lib/types";

const item = (o: Partial<ItemDetail> = {}): ItemDetail => ({
  id: 1,
  title: "t",
  type: "task",
  status: "todo",
  statusLocked: 0,
  priority: null,
  nextAction: null,
  notes: null,
  blockedReason: null,
  tags: [],
  position: 0,
  snoozedUntil: null,
  createdAt: "",
  updatedAt: "",
  sources: [],
  checklist: [],
  ...o,
});

describe("ItemFields empty-state collapse", () => {
  it("shows one collapsed row when next action, tags, and notes are all empty", () => {
    render(<ItemFields item={item()} onPatch={vi.fn()} />);
    expect(screen.getByText("+ next action")).toBeInTheDocument();
    expect(screen.getByText("tag")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
    expect(screen.queryByText("Add a next action…")).not.toBeInTheDocument();
  });

  it("reveals all three normal fields when a collapsed segment is clicked", () => {
    render(<ItemFields item={item()} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByText("+ next action"));
    expect(screen.getByText("Add a next action…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("add tag…")).toBeInTheDocument();
    expect(screen.getByText("Add notes…")).toBeInTheDocument();
    expect(screen.queryByText("+ next action")).not.toBeInTheDocument();
  });

  it("renders all three fields normally, uncollapsed, when nextAction already has content", () => {
    render(<ItemFields item={item({ nextAction: "Ship it" })} onPatch={vi.fn()} />);
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("add tag…")).toBeInTheDocument();
    expect(screen.queryByText("+ next action")).not.toBeInTheDocument();
  });

  it("renders all three fields normally, uncollapsed, when tags already has content", () => {
    render(<ItemFields item={item({ tags: ["urgent"] })} onPatch={vi.fn()} />);
    expect(screen.getByText("urgent")).toBeInTheDocument();
    expect(screen.getByText("Add a next action…")).toBeInTheDocument();
  });

  it("shows the blocked-reason prompt when blocked, even while the other three fields are collapsed", () => {
    render(<ItemFields item={item({ status: "blocked" })} onPatch={vi.fn()} />);
    expect(screen.getByText("Why is this blocked?")).toBeInTheDocument();
    expect(screen.getByText("+ next action")).toBeInTheDocument();
  });

  it("does not show the blocked-reason prompt when not blocked", () => {
    render(<ItemFields item={item({ status: "todo" })} onPatch={vi.fn()} />);
    expect(screen.queryByText("Why is this blocked?")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/item-fields.test.tsx )`

Expected: FAIL — cannot find module `@/components/detail/item-fields`.

- [ ] **Step 3: Create `components/detail/item-fields.tsx`**

This relocates the next-action, blocked-reason, tags, and notes block from `detail-sheet.tsx:265-296` verbatim, adding the collapse/reveal state:

```tsx
"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import type { ItemDetail } from "@/lib/types";
import { EditableText } from "./editable-text";
import { TagInput } from "./tag-input";
import { NotesEditor } from "./notes-editor";

function CollapsedFieldsRow({ onReveal }: { onReveal: () => void }) {
  return (
    <div className="mt-4 flex items-center gap-1.5 text-[12px] text-text-faint">
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        + next action
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        tag
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" onClick={onReveal} className="transition hover:text-foreground">
        note
      </button>
    </div>
  );
}

export function ItemFields({
  item,
  onPatch,
}: {
  item: ItemDetail;
  onPatch: (patch: Record<string, unknown>) => void;
}) {
  const [forceReveal, setForceReveal] = useState(false);
  const hasAnyContent = !!item.nextAction || item.tags.length > 0 || !!item.notes;
  const showCollapsed = !hasAnyContent && !forceReveal;

  return (
    <>
      {item.status === "blocked" && (
        <div className="mt-2.5 flex items-start gap-1.5">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-st-blocked" />
          <EditableText
            value={item.blockedReason}
            onCommit={(v) => onPatch({ blockedReason: v || null })}
            placeholder="Why is this blocked?"
            displayClassName="text-[12.5px] text-st-blocked"
            inputClassName="flex-1 rounded-md border border-st-blocked/40 bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
          />
        </div>
      )}

      {showCollapsed ? (
        <CollapsedFieldsRow onReveal={() => setForceReveal(true)} />
      ) : (
        <>
          <div className="mt-4 flex items-start gap-1.5">
            <span className="mt-0.5 text-[12.5px] text-primary">→</span>
            <EditableText
              value={item.nextAction}
              onCommit={(v) => onPatch({ nextAction: v || null })}
              placeholder="Add a next action…"
              displayClassName="text-[12.5px] text-muted-foreground"
              inputClassName="flex-1 rounded-md border border-primary bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
            />
          </div>

          <div className="mt-4">
            <TagInput tags={item.tags} onChange={(t) => onPatch({ tags: t })} />
          </div>

          <div className="mt-5">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">Notes</div>
            <NotesEditor value={item.notes} onCommit={(v) => onPatch({ notes: v || null })} />
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/item-fields.test.tsx )`

Expected: PASS — all 6 tests green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors.

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/item-fields.tsx test/item-fields.test.tsx )`

Expected: both new, unstaged. Do NOT commit.

---

### Task 6: Extract `pr-group.tsx` (role-group header + per-PR hover overlay)

**Files:**
- Create: `components/detail/pr-group.tsx`
- Test: `test/pr-group.test.tsx`

**Interfaces:**
- Consumes: `PrRow` from `./pr-row` (Task 4's rewritten version — same `{ src }` signature). `LinkedSource`, `SourceRole` from `@/lib/types`.
- Produces: `PrGroup({ role, label, target, sources, onPatchSource, onRemoveSource })` where `onPatchSource: (id: number, patch: Record<string, unknown>) => void` and `onRemoveSource: (id: number) => void`. Task 7 renders one `<PrGroup>` per non-empty role instead of the current inline `ROLE_META.map(...)` block.

- [ ] **Step 1: Write the failing test**

Create `test/pr-group.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrGroup } from "@/components/detail/pr-group";
import type { LinkedSource } from "@/lib/types";

const src = (o: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 1,
  itemId: 1,
  kind: "github_pr",
  externalId: "api#66682",
  repo: "api",
  number: 66682,
  url: null,
  title: null,
  state: "open",
  role: "base",
  targetBranch: "master",
  stackedOn: null,
  // Deliberately distinct from any group's source count used below, so the
  // merge-order badge text never collides with the header's count-pill text
  // in a getByText query (both can render a bare digit).
  mergeOrder: 9,
  mergeable: null,
  commentsCount: null,
  unresolvedThreads: null,
  meta: null,
  lastSyncedAt: null,
  ...o,
});

describe("PrGroup", () => {
  it("renders the section header with label, target, and count", () => {
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        // targetBranch/stackedOn cleared on the source itself: PrRow renders
        // its own target label from the source, which would otherwise also
        // read "→ master" and collide with the header's own target text in
        // a getByText query. This isolates the assertion to the header.
        sources={[src({ targetBranch: null, stackedOn: null })]}
        onPatchSource={vi.fn()}
        onRemoveSource={vi.fn()}
      />,
    );
    expect(screen.getByText("Base PRs")).toBeInTheDocument();
    expect(screen.getByText("→ master")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders one PrRow per source", () => {
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src({ id: 1, number: 1 }), src({ id: 2, number: 2, externalId: "api#2" })]}
        onPatchSource={vi.fn()}
        onRemoveSource={vi.fn()}
      />,
    );
    expect(screen.getByText("api #1")).toBeInTheDocument();
    expect(screen.getByText("api #2")).toBeInTheDocument();
  });

  it("calls onPatchSource with the new role and target when the role select changes", () => {
    const onPatchSource = vi.fn();
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src()]}
        onPatchSource={onPatchSource}
        onRemoveSource={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("PR role"), { target: { value: "stacked" } });
    expect(onPatchSource).toHaveBeenCalledWith(1, { role: "stacked", targetBranch: "base PR branch" });
  });

  it("calls onRemoveSource with the source id when the remove button is clicked", () => {
    const onRemoveSource = vi.fn();
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src()]}
        onPatchSource={vi.fn()}
        onRemoveSource={onRemoveSource}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove PR"));
    expect(onRemoveSource).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-group.test.tsx )`

Expected: FAIL — cannot find module `@/components/detail/pr-group`.

- [ ] **Step 3: Create `components/detail/pr-group.tsx`**

This relocates the `ROLE_META.map` body from `detail-sheet.tsx:298-344` verbatim, parameterized, with `z-20` added to the hover overlay so it outranks `PrRow`'s own stretched-link overlay (which has no explicit z-index, i.e. effectively `0`):

```tsx
"use client";

import { X } from "lucide-react";
import type { LinkedSource, SourceRole } from "@/lib/types";
import { PrRow } from "./pr-row";

export function PrGroup({
  role,
  label,
  target,
  sources,
  onPatchSource,
  onRemoveSource,
}: {
  role: SourceRole;
  label: string;
  target: string;
  sources: LinkedSource[];
  onPatchSource: (id: number, patch: Record<string, unknown>) => void;
  onRemoveSource: (id: number) => void;
}) {
  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">{label}</span>
        <span className="text-[10.5px] text-text-faint">{target}</span>
        <span className="rounded-full bg-card px-1.5 py-px text-[11px] text-text-faint">{sources.length}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {sources.map((s) => (
          <div key={s.id} className="group/pr relative">
            <PrRow src={s} />
            {/* z-20: must outrank PrRow's own stretched-link overlay (an
                unpositioned z-index, effectively 0) so the role select and
                remove button stay clickable on hover. */}
            <div className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex items-center gap-0.5 rounded-md border border-hairline bg-popover px-1 py-0.5 opacity-0 shadow-sm transition group-hover/pr:pointer-events-auto group-hover/pr:opacity-100">
              <select
                aria-label="PR role"
                value={s.role === "stacked" ? "stacked" : s.role === "docs" ? "docs" : "base"}
                onChange={(e) => {
                  const r = e.target.value;
                  onPatchSource(s.id, {
                    role: r,
                    targetBranch: r === "stacked" ? "base PR branch" : "master",
                  });
                }}
                className="h-5 cursor-pointer rounded bg-transparent text-[10px] text-muted-foreground outline-none"
              >
                <option value="base">Base</option>
                <option value="stacked">Stacked</option>
                <option value="docs">Docs</option>
              </select>
              <button
                onClick={() => onRemoveSource(s.id)}
                aria-label="Remove PR"
                className="text-text-faint transition hover:text-st-blocked"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

Note: `role` is accepted as a prop for interface completeness (matching how the caller iterates `ROLE_META`) but isn't read inside the component — the `key` for each group is applied by the caller (Task 7). This is intentional; do not add unused-prop workarounds.

- [ ] **Step 4: Run the test to verify it passes**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx vitest run test/pr-group.test.tsx )`

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit )`

Expected: no new errors. If `role` being unused triggers a lint/TS warning, that's expected per the note above — do not suppress it by renaming to `_role`; leave it named `role` since it documents the prop's meaning to callers, and confirm via Step 5 that it's a warning, not a build-breaking error (unused destructured props are not a TS error by default in this project's `tsconfig.json`).

- [ ] **Step 6: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/pr-group.tsx test/pr-group.test.tsx )`

Expected: both new, unstaged. Do NOT commit.

---

### Task 7: Wire `ItemFields` and `PrGroup` into `detail-sheet.tsx`

**Files:**
- Modify: `components/detail/detail-sheet.tsx`

**Interfaces:**
- Consumes: `ItemFields` from `./item-fields` (Task 5), `PrGroup` from `./pr-group` (Task 6).
- Produces: no new exports — `DetailSheet`'s own signature is unchanged.

- [ ] **Step 1: Update imports**

In `components/detail/detail-sheet.tsx`, the import block currently includes (lines 16-21):

```tsx
import { PrRow } from "./pr-row";
import { EditableText } from "./editable-text";
import { NotesEditor } from "./notes-editor";
import { TagInput } from "./tag-input";
import { ActivityTimeline } from "./activity-timeline";
import { AddSource } from "./add-source";
```

Replace with:

```tsx
import { ActivityTimeline } from "./activity-timeline";
import { AddSource } from "./add-source";
import { ItemFields } from "./item-fields";
import { PrGroup } from "./pr-group";
```

`PrRow`, `EditableText`, `NotesEditor`, and `TagInput` are no longer used directly in this file — they now live inside `item-fields.tsx` and `pr-group.tsx`.

- [ ] **Step 2: Replace the next-action/blocked-reason/tags/notes block**

Delete lines 265-296 (from the next-action `<div className="mt-4 flex items-start gap-1.5">` block through the closing of the notes `<div className="mt-5">` block — everything between the delete-confirmation block and the `ROLE_META.map` block):

```tsx
            <div className="mt-4 flex items-start gap-1.5">
              <span className="mt-0.5 text-[12.5px] text-primary">→</span>
              <EditableText
                value={item.nextAction}
                onCommit={(v) => patchItem({ nextAction: v || null })}
                placeholder="Add a next action…"
                displayClassName="text-[12.5px] text-muted-foreground"
                inputClassName="flex-1 rounded-md border border-primary bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
              />
            </div>

            {item.status === "blocked" && (
              <div className="mt-2.5 flex items-start gap-1.5">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-st-blocked" />
                <EditableText
                  value={item.blockedReason}
                  onCommit={(v) => patchItem({ blockedReason: v || null })}
                  placeholder="Why is this blocked?"
                  displayClassName="text-[12.5px] text-st-blocked"
                  inputClassName="flex-1 rounded-md border border-st-blocked/40 bg-card px-2 py-0.5 text-[12.5px] text-foreground outline-none"
                />
              </div>
            )}

            <div className="mt-4">
              <TagInput tags={item.tags} onChange={(t) => patchItem({ tags: t })} />
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">Notes</div>
              <NotesEditor value={item.notes} onCommit={(v) => patchItem({ notes: v || null })} />
            </div>
```

Replace with:

```tsx
            <ItemFields item={item} onPatch={patchItem} />
```

- [ ] **Step 3: Replace the `ROLE_META.map` block**

Replace the current block (originally lines 298-344, now shifted up by the Step 2 deletion — locate it by its `{ROLE_META.map(({ role, label, target }) => {` opening line):

```tsx
            {ROLE_META.map(({ role, label, target }) => {
              const srcs = byRole(role);
              if (!srcs.length) return null;
              return (
                <div key={role} className="mt-5">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
                      {label}
                    </span>
                    <span className="text-[10.5px] text-text-faint">{target}</span>
                    <span className="rounded-full bg-card px-1.5 py-px text-[11px] text-text-faint">{srcs.length}</span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {srcs.map((s) => (
                      <div key={s.id} className="group/pr relative">
                        <PrRow src={s} />
                        <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-md border border-hairline bg-popover px-1 py-0.5 opacity-0 shadow-sm transition group-hover/pr:pointer-events-auto group-hover/pr:opacity-100">
                          <select
                            aria-label="PR role"
                            value={s.role === "stacked" ? "stacked" : s.role === "docs" ? "docs" : "base"}
                            onChange={(e) => {
                              const r = e.target.value;
                              patchSource(s.id, {
                                role: r,
                                targetBranch: r === "stacked" ? "base PR branch" : "master",
                              });
                            }}
                            className="h-5 cursor-pointer rounded bg-transparent text-[10px] text-muted-foreground outline-none"
                          >
                            <option value="base">Base</option>
                            <option value="stacked">Stacked</option>
                            <option value="docs">Docs</option>
                          </select>
                          <button
                            onClick={() => removeSourceFromItem(s.id)}
                            aria-label="Remove PR"
                            className="text-text-faint transition hover:text-st-blocked"
                          >
                            <X className="size-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
```

Replace with:

```tsx
            {ROLE_META.map(({ role, label, target }) => {
              const srcs = byRole(role);
              if (!srcs.length) return null;
              return (
                <PrGroup
                  key={role}
                  role={role}
                  label={label}
                  target={target}
                  sources={srcs}
                  onPatchSource={patchSource}
                  onRemoveSource={removeSourceFromItem}
                />
              );
            })}
```

- [ ] **Step 4: Remove now-unused `Lock` import if nothing else in the file uses it**

Check whether `Lock` is still referenced anywhere else in `detail-sheet.tsx` after Steps 2-3:

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; grep -n "Lock" components/detail/detail-sheet.tsx )`

If the only remaining match is the `import { Trash2, ChevronDown, Lock, Bell, X } from "lucide-react";` line itself, remove `Lock` from that import (it moved into `item-fields.tsx`). Also check `X`:

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; grep -n "\bX\b" components/detail/detail-sheet.tsx )`

`X` is still used by the header's close button (`<X className="size-4" />` near the top of the file) — keep it in the import. Update the import line to whatever the grep results show is actually still used (expected result: `import { Trash2, ChevronDown, Bell, X } from "lucide-react";`, with `Lock` removed).

- [ ] **Step 5: Run the full test suite**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm test )`

Expected: PASS. There is no dedicated `detail-sheet.test.tsx` in this project, so this step's job is confirming no regression in the suite as a whole (`pr-row`, `item-fields`, `pr-group`, and all other existing tests) — `detail-sheet.tsx` itself is verified live in Task 8.

- [ ] **Step 6: Typecheck and build**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npx tsc --noEmit && npm run build )`

Expected: both clean. The build step matters here specifically — it's the only step in this task that actually parses the full JSX after the two block replacements, catching a mismatched brace or stray leftover reference that `tsc --noEmit` alone might not fully exercise for a file this size.

- [ ] **Step 7: Leave unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short components/detail/detail-sheet.tsx )`

Expected: modified, unstaged. Do NOT commit.

---

### Task 8: Live verification

Unit tests and a clean build are not sufficient proof for a UI rework — this project has a known failure mode where render tests pass while the real UI is wrong. Every piece of this plan must be seen working against the real `deck.db`.

**Files:** none — verification and the one-time data purge only.

- [ ] **Step 1: Back up the database before the purge**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; cp deck.db "deck.db.bak-$(date +%Y%m%d)" && ls -la deck.db*.bak-* )`

Expected: a `deck.db.bak-YYYYMMDD` file exists alongside `deck.db`.

- [ ] **Step 2: Run the purge script against the real database**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; node scripts/purge-duplicate-conflicts.mjs deck.db )`

Expected output: a line like `pr_conflict rows: 11 -> 2 (removed 9)` (exact numbers depend on current data — compare against the counts pulled during design, roughly 7 duplicate `#3189` rows and 3 duplicate `#3096` rows collapsing to 1 each).

- [ ] **Step 3: Verify the purge in the database directly**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; sqlite3 deck.db "SELECT summary, COUNT(*) FROM activity WHERE type='pr_conflict' GROUP BY summary HAVING COUNT(*) > 1;" )`

Expected: empty output (no summary has more than one row left).

- [ ] **Step 4: Start the dev server and trigger a fresh sync**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm run dev )` (if not already running), then:

`curl -s -X POST http://localhost:3000/api/sync`

Expected: a JSON response with a non-zero `synced` count. This exercises Task 1's `normalizePr` fix against live GitHub data — watch for it not throwing.

- [ ] **Step 5: Confirm no new duplicate conflict rows appear after the fresh sync**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; sqlite3 deck.db "SELECT summary, COUNT(*) FROM activity WHERE type='pr_conflict' GROUP BY summary HAVING COUNT(*) > 1;" )`

Expected: still empty. If any PR's `mergeable` was genuinely `UNKNOWN` on this sync, this confirms Task 1's fix prevented a bogus row rather than merely deferring it.

- [ ] **Step 6: Open the "1CC auth-configs decomp" item (or any multi-PR item with a failing required check) in the browser and verify visually**

Navigate to `http://localhost:3000`, open the item, and confirm:

- Every failing check renders **inside** its PR's card — none float below or overflow the card edge.
- Each PR row shows one meta line (e.g. `conflicts · 5 checks failing · review · 9 unresolved`), not stacked coloured pills.
- Long check names (e.g. `Ready For Review Label Added`) truncate to one line; hovering shows the full name via the browser's native title tooltip.
- Two same-named failing checks (if any PR in the data still has them, e.g. a repeat `Lint`) both appear with distinct links.
- Clicking a PR's id text opens the PR on GitHub; clicking anywhere else on the card body also opens it (the stretched-link overlay); clicking a failing-check link opens that check's run, not the PR.
- The role-select dropdown and remove (×) button on hover still work — change a PR's role and confirm it persists, then revert it.
- A merged PR's row shows no failing-check block and a green `merged` meta item, regardless of what GitHub currently reports for its `mergeable` field.
- The activity log at the bottom no longer shows repeated `Conflicts on ...` entries at 2h/4h/5h/7h/11h/1d/1d — Task 2 and Task 3 together should leave at most one recent entry per PR.
- On an item with all three of next action / tags / notes empty, the sheet shows the single `+ next action · tag · note` row instead of three separate empty prompts; clicking any segment reveals all three normal fields.
- On an item where any of those three already has content, all three render normally with no collapsed row.
- A same-repo stacked PR's target (if `stackedOn` is populated on any existing row — check via `sqlite3 deck.db "SELECT repo, number, stacked_on FROM linked_sources WHERE stacked_on IS NOT NULL;"`) shows the abbreviated `→ #NNN` form; if no row has `stacked_on` set yet, confirm instead that targets still render via the `targetBranch` fallback exactly as before (e.g. `→ master`, `→ base PR branch`) — a live gap to note, not a defect, per the design's stated scope limit.

- [ ] **Step 7: Check the browser console**

Verify on a fresh server and a new tab (not a `location.reload()`, which doesn't clear the console buffer in this project's browser tooling). Confirm no hydration warnings and no `validateDOMNesting`/nested-anchor warnings — this is the strongest signal the stretched-link pattern is structurally sound, since React logs that warning loudly when an `<a>` ends up inside another `<a>`.

- [ ] **Step 8: Check contrast across themes**

Cycle through all 5 themes (light, dark, midnight, dracula, rosepine) via the theme picker. Confirm the meta line's `text-st-blocked`/`text-st-review`/`text-st-done` colours remain legible against the card background in each — these are the same tokens verified for contrast in the required-checks feature (`--st-blocked` measured 3.99–6.46:1), so this step is a spot-check for regressions from the new layout, not a fresh contrast audit.

- [ ] **Step 9: Production build**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; npm run build )`

Expected: clean build, all routes generated (same 14 routes as before — this task adds no new routes).

- [ ] **Step 10: Confirm everything is unstaged**

Run: `( cd /Users/dontula.abhilash/Documents/onlymagic/deck-next 2>/dev/null; git status --short )`

Expected: all changes from Tasks 1-7 present and unstaged (plus the new `deck.db.bak-YYYYMMDD` file from Step 1, which is a local backup artifact, not source — leave it, do not delete it, and do not stage it). Do NOT commit anything.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| §1 Stretched-link pattern, `::after`, `z-10`/`z-20` stacking | 4, 6 |
| §1 Meta line table (all 10 item types + colour rules) | 4 |
| §1 Failing checks nested, uncapped, truncated, `title` | 4 |
| §1 Stacked target abbreviation via `stackedOn` | 4 |
| §2 `normalizePr` UNKNOWN → undefined | 1 |
| §3 `importSources` skip conflict logging on merged/closed | 2 |
| §4 One-time purge (backup + `DELETE`) | 3 (script + test), 8 (live backup + run) |
| §5 Empty-field collapse into one row, blockedReason unaffected | 5 |
| §6 Extract `item-fields.tsx` and `pr-group.tsx`, `detail-sheet.tsx` becomes composition | 5, 6, 7 |
| Testing section's full list | 1, 2, 3, 4, 5, 6 |
| Non-goals (no migration, no status/attention/card changes, no `stackedOn`-collection UI) | Respected — no task touches `computeStatus`, `attentionReason`, `card.tsx`, or the add-source role picker |

**Ambiguity resolved during planning (not present in the original spec text):** the spec's "icon only, same treatment as passing" for the `approved` review state was ambiguous about whether the word itself disappears (which would make `approved` and `checks passing` visually indistinguishable — a real information loss). Task 4 resolves this by giving both a small `Check` icon *plus* their own neutral-coloured label (`"approved"` / `"checks passing"`) — the icon carries the colour, the text carries the distinction. This satisfies the spec's actual intent (a good outcome shouldn't visually compete with a bad one) without erasing information.

**Placeholder scan:** none found — every step has complete, runnable code or an exact command with expected output.

**Type consistency:** `PrRow({ src }: { src: LinkedSource })` (Task 4) is consumed identically by `PrGroup` (Task 6) and unchanged from before. `ItemFields({ item, onPatch })` (Task 5) and `PrGroup({ role, label, target, sources, onPatchSource, onRemoveSource })` (Task 6) match exactly how Task 7 calls them. `PURGE_SQL` (Task 3) is imported by name in both the test and (implicitly, by the script's own `main()`) production use. `normalizePr`'s new return type (`mergeable: string | undefined`, Task 1) matches `ImportRecord.mergeable?: string` (already optional, no change needed) consumed by Task 2's `importSources`.
