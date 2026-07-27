# Deck-Next — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Deck on Next.js + React + SQLite with feature parity, PR conflict/review-comment insight, and light/dark theming — served locally at `localhost:3000`.

**Architecture:** Next.js App Router. A server-side model layer (Drizzle ORM over `better-sqlite3`) holds all logic; Route Handlers under `/app/api/*` expose it as JSON; React client components use SWR to fetch/mutate/poll. UI built with Tailwind + shadcn/ui + next-themes. Sync shells out to `gh`.

**Tech Stack:** Next.js (App Router, TS), Drizzle ORM, better-sqlite3, Tailwind CSS, shadcn/ui (Radix), next-themes, SWR, react-markdown, Vitest + @testing-library/react.

**Canonical reference (read before implementing):** the existing vanilla app at `../deck/` (relative to this project). It is the source of truth for **business logic** (`../deck/src/model.ts`, `../deck/src/sync.ts`, `../deck/src/cli.ts`), **appearance** (`../deck/src/public/styles.css`, `../deck/src/public/app.js`), and **tests** (`../deck/test/*`). This plan specifies the Next/Drizzle/React adaptations; port proven logic/markup rather than reinventing it.

## Global Constraints

- **Local-only, NO git.** This project has no version control. Do NOT run `git init`/`commit`/`push`. Each task's checkpoint is "the task's tests pass", not a commit.
- Next.js **App Router**, TypeScript. Runs via `npm run dev` at `localhost:3000`.
- **DB access is server-side only** (Route Handlers / server modules) — never import the DB from a client component. `next.config.ts` must set `serverExternalPackages: ['better-sqlite3']`.
- SQLite file: `deck.db` at project root. Tests use `:memory:` or a temp file — never the real `deck.db`.
- **Model semantics (verbatim from spec):** import is idempotent by `UNIQUE(kind, external_id)`; `status_locked=1` protects a manually-set status from sync; `blocked` is never auto-set; multi-PR items aggregate status; **partial updates never clobber unspecified fields — `updateSource` writes only fields that are `!== undefined`** (a `null` still clears).
- Column name mapping: DB is snake_case; Drizzle TS properties are camelCase (`status_locked` ↔ `statusLocked`). API JSON uses the **snake_case** names the current app used (`status_locked`, `next_action`, `merge_order`, `target_branch`, `blocked_reason`, `comments_count`, `unresolved_threads`) so payloads match the reference — map at the model boundary.
- Dependencies: `next react react-dom drizzle-orm better-sqlite3 next-themes swr react-markdown`; dev: `drizzle-kit vitest @testing-library/react @testing-library/jest-dom jsdom @types/better-sqlite3 @types/node`. shadcn components via `npx shadcn@latest add`.
- Sentence case in UI copy; no emoji in code output.

---

## Task 1: Scaffold Next.js + Tailwind + shadcn + Drizzle + Vitest

**Files:**
- Create (via generator): the Next app in `deck-next/` (keep existing `docs/`).
- Create/modify: `next.config.ts`, `vitest.config.ts`, `test/setup.ts`, `test/smoke.test.ts`, `.gitignore`, `drizzle.config.ts`, `components.json` (shadcn).

**Interfaces:**
- Produces: a running Next app (`npm run dev`), a passing `npm test`, Tailwind + shadcn wired, and the deps installed. No app logic yet.

- [ ] **Step 1: Scaffold Next into the existing folder**

Run (non-interactive), from `/Users/dontula.abhilash/Documents/onlymagic`:
```bash
npx create-next-app@latest deck-next --ts --tailwind --app --no-src-dir --eslint --use-npm --import-alias "@/*" --yes
```
If it refuses because `deck-next/` is non-empty (the `docs/` folder), scaffold in a temp dir and copy in:
```bash
npx create-next-app@latest /tmp/deck-next-scaffold --ts --tailwind --app --no-src-dir --eslint --use-npm --import-alias "@/*" --yes
cp -R /tmp/deck-next-scaffold/. /Users/dontula.abhilash/Documents/onlymagic/deck-next/
rm -rf /tmp/deck-next-scaffold
```
Expected: `deck-next/` now has `app/`, `package.json`, `tailwind.config.*`, `tsconfig.json`, `next.config.*`, plus the pre-existing `docs/`.

- [ ] **Step 2: Install runtime + dev deps**

Run: `npm --prefix /Users/dontula.abhilash/Documents/onlymagic/deck-next install drizzle-orm better-sqlite3 next-themes swr react-markdown`
Then: `npm --prefix /Users/dontula.abhilash/Documents/onlymagic/deck-next install -D drizzle-kit vitest @testing-library/react @testing-library/jest-dom jsdom @types/better-sqlite3`

- [ ] **Step 3: Configure `next.config.ts`** — mark better-sqlite3 external so it isn't bundled:

```ts
import type { NextConfig } from 'next';
const nextConfig: NextConfig = { serverExternalPackages: ['better-sqlite3'] };
export default nextConfig;
```

- [ ] **Step 4: Init shadcn/ui** (non-interactive defaults, base color neutral):

Run: `cd /Users/dontula.abhilash/Documents/onlymagic/deck-next && npx shadcn@latest init -d`
Then add the primitives Phase 1 uses:
`npx shadcn@latest add button dialog sheet dropdown-menu badge input textarea tooltip`
Expected: `components/ui/*` created, `lib/utils.ts` created.

- [ ] **Step 5: Configure Vitest** — `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', setupFiles: ['./test/setup.ts'], globals: true },
  resolve: { alias: { '@': new URL('.', import.meta.url).pathname } },
});
```
Install the react plugin: `npm --prefix /Users/.../deck-next install -D @vitejs/plugin-react`.
`test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```
Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 6: Add `drizzle.config.ts`** (used by drizzle-kit to generate migrations):

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  dialect: 'sqlite',
  schema: './lib/schema.ts',
  out: './drizzle',
});
```

- [ ] **Step 7: Ensure `.gitignore` covers local artifacts** (repo has no git, but keep it tidy): add lines `deck.db`, `deck.db-*` to the generated `.gitignore` if absent.

- [ ] **Step 8: Smoke test** — `test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
describe('toolchain', () => { it('runs', () => { expect(1 + 1).toBe(2); }); });
```

- [ ] **Step 9: Verify** — Run `npm --prefix /Users/.../deck-next test` → 1 passing. Run `npm --prefix /Users/.../deck-next run build` → builds without error. Checkpoint (no git).

---

## Task 2: Drizzle schema + DB client

**Files:**
- Create: `lib/schema.ts`, `lib/db.ts`, `drizzle/` (generated), `test/db.test.ts`

**Interfaces:**
- Produces: `getDb(path?: string)` returning a Drizzle client bound to a `better-sqlite3` connection with the schema applied (foreign keys on, WAL). Exposes `schema` tables `workItems`, `linkedSources`, `checklistItems`. Default path `deck.db`; `:memory:` for tests.

- [ ] **Step 1: Write `lib/schema.ts`** — all three tables incl. the Phase-1 additions (`position`, `snoozed_until`, `mergeable`, `comments_count`, `unresolved_threads`). Columns mirror `../deck/src/schema.sql` plus the new ones. Full definition:

```ts
import { sqliteTable, integer, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const workItems = sqliteTable('work_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  type: text('type').notNull().default('task'),
  status: text('status').notNull().default('todo'),
  statusLocked: integer('status_locked').notNull().default(0),
  priority: text('priority'),
  nextAction: text('next_action'),
  notes: text('notes'),
  blockedReason: text('blocked_reason'),
  tags: text('tags').notNull().default('[]'),
  position: integer('position').notNull().default(0),
  snoozedUntil: text('snoozed_until'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const linkedSources = sqliteTable('linked_sources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  externalId: text('external_id'),
  repo: text('repo'),
  number: integer('number'),
  url: text('url'),
  title: text('title'),
  state: text('state'),
  role: text('role'),
  targetBranch: text('target_branch'),
  stackedOn: text('stacked_on'),
  mergeOrder: integer('merge_order'),
  mergeable: text('mergeable'),
  commentsCount: integer('comments_count'),
  unresolvedThreads: integer('unresolved_threads'),
  meta: text('meta'),
  lastSyncedAt: text('last_synced_at'),
}, (t) => ({
  dedup: uniqueIndex('idx_sources_dedup').on(t.kind, t.externalId),
  byItem: index('idx_sources_item').on(t.itemId),
}));

export const checklistItems = sqliteTable('checklist_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemId: integer('item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  subtext: text('subtext'),
  done: integer('done').notNull().default(0),
  position: integer('position').notNull().default(0),
});
```

- [ ] **Step 2: Write `lib/db.ts`** — connection + apply schema. Because we ship a plain SQLite file and want zero migration ceremony locally, create tables idempotently with `CREATE TABLE IF NOT EXISTS` mirroring the drizzle schema (generate the SQL once via `npx drizzle-kit generate` into `drizzle/`, then apply all files), OR apply an inline DDL string. Use the inline-DDL approach for simplicity:

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const DDL = `
CREATE TABLE IF NOT EXISTS work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'todo', status_locked INTEGER NOT NULL DEFAULT 0, priority TEXT,
  next_action TEXT, notes TEXT, blocked_reason TEXT, tags TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0, snoozed_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS linked_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, external_id TEXT, repo TEXT, number INTEGER, url TEXT, title TEXT, state TEXT,
  role TEXT, target_branch TEXT, stacked_on TEXT, merge_order INTEGER, mergeable TEXT,
  comments_count INTEGER, unresolved_threads INTEGER, meta TEXT, last_synced_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_dedup ON linked_sources(kind, external_id);
CREATE INDEX IF NOT EXISTS idx_sources_item ON linked_sources(item_id);
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  text TEXT NOT NULL, subtext TEXT, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);`;

export type DrizzleDb = ReturnType<typeof drizzle<typeof schema>> & { $client: Database.Database };

export function getDb(path = 'deck.db'): DrizzleDb {
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema }) as DrizzleDb;
}
```

- [ ] **Step 3: Test** — `test/db.test.ts` (write first, run to fail, then it passes once db.ts exists):

```ts
import { describe, it, expect } from 'vitest';
import { getDb } from '@/lib/db';
import { workItems } from '@/lib/schema';
describe('getDb', () => {
  it('creates tables and round-trips an insert', () => {
    const db = getDb(':memory:');
    db.insert(workItems).values({ title: 'x', createdAt: 't', updatedAt: 't' }).run();
    const rows = db.select().from(workItems).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('x');
  });
});
```
Run: `npm test -- test/db.test.ts` → PASS.

---

## Task 3: Types + item CRUD model

**Files:**
- Create: `lib/types.ts`, `lib/model/items.ts`, `test/model.items.test.ts`

**Interfaces:**
- Produces (types.ts): the API-facing shapes in **snake_case** (matching the reference app): `WorkItem { id, title, type, status, status_locked, priority, next_action, notes, blocked_reason, tags: string[], position, snoozed_until, created_at, updated_at }`, `LinkedSource { id, item_id, kind, external_id, repo, number, url, title, state, role, target_branch, stacked_on, merge_order, mergeable, comments_count, unresolved_threads, meta, last_synced_at }`, `ChecklistItem { id, item_id, text, subtext, done, position }`, `ItemDetail extends WorkItem { sources: LinkedSource[]; checklist: ChecklistItem[] }`, plus enums. Also `nowIso()`.
- Produces (items.ts): `createItem(db, input): WorkItem`, `getItem(db, id): ItemDetail|null`, `listItems(db, filters?): ItemDetail[]`, `updateItem(db, id, patch): WorkItem`, `deleteItem(db, id): void`. Rows are mapped drizzle(camel) → API(snake) by a `toItem`/`toSource` mapper. **`updateItem` with `status` in patch sets `status_locked=1` unless `patch.lockStatus === false`.**

- [ ] **Step 1: Port the reference model.** Read `../deck/src/model.ts` and `../deck/src/types.ts`. Reimplement the same functions and semantics using Drizzle queries instead of raw `better-sqlite3` prepared statements, mapping camelCase columns to the snake_case API shape at the boundary. The behavior (defaults, filters, status_locked rule, sources ordered by `merge_order NULLS LAST, id`, checklist by `position, id`, tags JSON parse) must match exactly.

- [ ] **Step 2: Write `test/model.items.test.ts`** — port from `../deck/test/model.items.test.ts`, adapting imports to `@/lib/db` `getDb(':memory:')` and `@/lib/model/items`. Assertions unchanged (create defaults, manual status locks, `lockStatus:false` doesn't lock, filters by status/`q`, delete). Run to fail first.

- [ ] **Step 3: Implement `lib/types.ts` + `lib/model/items.ts`** to pass. Filters: `status/type/priority` exact, `tag` JSON LIKE, `repo` via join to a source, `q` title LIKE; order `updated_at DESC` then `position`.

- [ ] **Step 4: Run** `npm test -- test/model.items.test.ts` → PASS.

---

## Task 4: Sources + checklist model

**Files:**
- Create: `lib/model/sources.ts`, `lib/model/checklist.ts`, `test/model.sources-checklist.test.ts`

**Interfaces:**
- Produces: `addSource(db, itemId, s): LinkedSource`, `updateSource(db, sourceId, patch): LinkedSource`, `allGithubSources(db): {external_id,repo,number,url}[]`; `addChecklist(db, itemId, text, subtext?): ChecklistItem`, `setChecklistDone(db, id, done): ChecklistItem`, `removeChecklist(db, id): void`.
- **Critical:** `updateSource` only writes fields where `patch[field] !== undefined` (so a state-only sync never wipes `role/target_branch/merge_order/title/...`); `meta` and the new `mergeable/comments_count/unresolved_threads` follow the same rule; a `null` clears. Touches parent `updated_at`.

- [ ] **Step 1: Write `test/model.sources-checklist.test.ts`** — port from `../deck/test/model.sources-checklist.test.ts` PLUS a test that a partial `updateSource({ state:'merged' })` preserves `role/target_branch/merge_order/title` and updates `mergeable/comments_count` when provided. Run to fail.

- [ ] **Step 2: Implement `sources.ts` + `checklist.ts`** (port from `../deck/src/model.ts`, Drizzle-adapted, with the `!== undefined` guard extended to `mergeable/comments_count/unresolved_threads`). `addChecklist` position = current max + 1.

- [ ] **Step 3: Run** `npm test -- test/model.sources-checklist.test.ts` → PASS.

---

## Task 5: Import/upsert + status computation

**Files:**
- Create: `lib/model/status.ts`, `lib/model/import.ts`, `test/model.import.test.ts`

**Interfaces:**
- Produces: `computeStatus(item, sources, checklist): Status` (blocked short-circuits; single-source PR/DevRev mapping; multi-PR aggregate — all merged+checklist→done, all open in review→in_review, else in_progress); `importSources(db, records): {created, updated}` (dedup by `(kind, external_id)`; find/create item by `item.title`; recompute status when `status_locked=0`, `lockStatus:false`). `ImportRecord` incl. optional `mergeable/comments_count/unresolved_threads`.

- [ ] **Step 1: Write `test/model.import.test.ts`** — port from `../deck/test/model.import.test.ts` (idempotency, collapse-by-title, multi-PR aggregate, `status_locked` survives, **partial-update preserves structure**). Run to fail.

- [ ] **Step 2: Implement `status.ts` + `import.ts`** — port `computeStatus`/`importSources` from `../deck/src/model.ts` verbatim in behavior, Drizzle-adapted, wrapping the loop in a transaction (`db.transaction(...)`).

- [ ] **Step 3: Run** `npm test -- test/model.import.test.ts` and the full model suite → PASS.

---

## Task 6: Sync module (`gh` → PR state + conflicts + comments)

**Files:**
- Create: `lib/sync.ts`, `test/sync.test.ts`

**Interfaces:**
- Produces: `normalizePr(d): { state, mergeable, comments_count, unresolved_threads }` — pure mapping from a `gh` JSON object: `mergedAt→'merged'`; `isDraft→'draft'`; `state==='CLOSED'→'closed'`; else `'open'`; `mergeable: 'MERGEABLE'→'mergeable' | 'CONFLICTING'→'conflicting' | else 'unknown'`; `comments_count = (comments?.length||0)+(reviews?.length||0)`; `unresolved_threads` from the GraphQL result (or 0). And `syncGithub(db): Promise<{synced, updated, results}>` — concurrent `execFile('gh', ['pr','view', url, '--json', 'state,isDraft,mergedAt,reviewDecision,mergeable,comments,reviews'])` per PR, plus one `gh api graphql` per PR for unresolved review-thread count, normalize, and `importSources` with only `state/meta/mergeable/comments_count/unresolved_threads` set (structure untouched).

- [ ] **Step 1: Write `test/sync.test.ts`** — pure unit tests for `normalizePr` (merged/draft/open/closed; conflicting→'conflicting'; comment counting; unresolved default 0). Run to fail.

- [ ] **Step 2: Implement `lib/sync.ts`** — port structure from `../deck/src/sync.ts` and extend: add `mergeable,comments,reviews` to the `--json` fields; add a `ghUnresolvedThreads(url)` helper running `gh api graphql -f query='...reviewThreads(first:100){nodes{isResolved}}...'` and counting `isResolved===false` (wrap in try/catch → 0 on failure). Build import records with the extra fields.

- [ ] **Step 3: Run** `npm test -- test/sync.test.ts` → PASS.

---

## Task 7: Route Handlers (`/app/api/*`)

**Files:**
- Create: `app/api/items/route.ts`, `app/api/items/[id]/route.ts`, `app/api/items/[id]/sources/route.ts`, `app/api/items/[id]/checklist/route.ts`, `app/api/sources/[id]/route.ts`, `app/api/checklist/[id]/route.ts`, `app/api/import/route.ts`, `app/api/sync/route.ts`, `lib/api-db.ts`, `test/api.test.ts`

**Interfaces:**
- Produces: JSON endpoints matching the reference REST surface — `GET/POST /api/items`, `GET/PATCH/DELETE /api/items/:id`, `POST /api/items/:id/sources`, `POST /api/items/:id/checklist`, `PATCH /api/sources/:id`, `PATCH/DELETE /api/checklist/:id`, `POST /api/import`, `POST /api/sync`. `lib/api-db.ts` exports a singleton `db()` (memoized `getDb()`), used by all handlers.
- Consumes: the model layer (Tasks 3–6).

- [ ] **Step 1: Write `lib/api-db.ts`** — memoized DB so handlers share one connection:
```ts
import { getDb, type DrizzleDb } from './db';
let _db: DrizzleDb | null = null;
export function db(): DrizzleDb { return (_db ??= getDb(process.env.DECK_DB ?? 'deck.db')); }
```

- [ ] **Step 2: Write `test/api.test.ts`** — import each route's handler and invoke with a `Request`, using a temp/`:memory:` db injected via `DECK_DB` or a test seam. Assert create→list, patch status, import idempotency, and that `POST /api/sync` with no PRs returns `{synced:0,updated:0,results:[]}`. Run to fail.

- [ ] **Step 3: Implement the handlers** — thin wrappers over the model. Example `app/api/items/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/api-db';
import { listItems, createItem } from '@/lib/model/items';
export async function GET(req: NextRequest) {
  const q = Object.fromEntries(req.nextUrl.searchParams);
  return NextResponse.json(listItems(db(), q as any));
}
export async function POST(req: NextRequest) {
  return NextResponse.json(createItem(db(), await req.json()), { status: 201 });
}
```
Implement the rest analogously; `/api/sync` calls `syncGithub(db())`.

- [ ] **Step 4: Run** `npm test -- test/api.test.ts` → PASS. Then `npm run build` → PASS.

---

## Task 8: Theme, design tokens, and app shell

**Files:**
- Create/modify: `app/globals.css` (tokens), `app/layout.tsx` (ThemeProvider), `components/theme/theme-provider.tsx`, `components/theme/theme-toggle.tsx`, `tailwind.config.ts` (map tokens)
- Test: `test/theme.test.tsx`

**Interfaces:**
- Produces: CSS-variable design tokens for **dark (default) and light**, ported from `../deck/src/public/styles.css` `:root` (bg/card/panel/border/hairline/text/accent/status/priority/radius). `ThemeProvider` (next-themes, `attribute="class"`, `defaultTheme="dark"`), `ThemeToggle` button. Tailwind extended so tokens are usable as `bg-card`, `text-muted`, etc.

- [ ] **Step 1: Write `app/globals.css`** — Tailwind directives + `:root`/`.dark` token blocks. Dark values = the current palette (`--bg:#0C0D11; --card:#16181E; --accent:#8B85F0; --st-todo/progress/review/blocked/done`, etc. from `../deck/src/public/styles.css`). Add a light-mode block under `:root` (light neutrals) and put the dark values under `.dark`. Expose each as a CSS var consumed by Tailwind theme.
- [ ] **Step 2: `tailwind.config.ts`** — extend `colors`/`borderRadius` to reference the CSS vars (e.g. `card: 'var(--card)'`).
- [ ] **Step 3: `components/theme/theme-provider.tsx`** wrapping `next-themes` `ThemeProvider`; use it in `app/layout.tsx` with `<html suppressHydrationWarning className="dark">`.
- [ ] **Step 4: `components/theme/theme-toggle.tsx`** — a button toggling `useTheme().setTheme(dark↔light)`.
- [ ] **Step 5: Test** `test/theme.test.tsx` — render `<ThemeToggle/>` inside the provider (jsdom), assert it renders a button. Run → PASS.
- [ ] **Step 6: Verify live** — `npm run dev`; the page background uses `--bg`; toggling flips `.dark` on `<html>`. Screenshot both themes.

---

## Task 9: Board — data hook + Board/Column/Card

**Files:**
- Create: `hooks/use-items.ts`, `components/board/board.tsx`, `components/board/column.tsx`, `components/board/card.tsx`, `components/board/pr-track.tsx`, `components/board/source-badges.tsx`, `app/page.tsx`
- Test: `test/card.test.tsx`

**Interfaces:**
- Consumes: `GET /api/items`. Produces: the live board. `useItems(filters)` = SWR over `/api/items?…` with `refreshInterval: 5000`. `Board` groups items into the 5 columns; `Card` renders type micro-label, priority chip, title, **PR-progress track for any PR-backed item** (single + multi, singular labels — port logic from `../deck/src/public/app.js renderCard`), source badges/link chips, **conflict dot** (any source `mergeable==='conflicting'`) and **unresolved-comments dot** (any source `unresolved_threads>0`), next-action, relative time.

- [ ] **Step 1: Write `test/card.test.tsx`** — render `<Card item={…}/>` with jsdom; assert: title present; a P0 chip when priority set; `1 / 2 PRs merged` for two PRs (one merged); `0 / 1 PR merged · 1 repo` for a single open PR; a conflict indicator when a source is `conflicting`; an unresolved indicator when `unresolved_threads>0`. Run to fail.
- [ ] **Step 2: Implement the components** — Tailwind + tokens; **port the card markup/logic and the styles from `../deck/src/public/{app.js,styles.css}`** into React/Tailwind (5 columns, status dots, PR track segments, badges, blocked note). Add the two new dots (conflict = `--st-blocked`, unresolved = `--st-review`).
- [ ] **Step 3: `app/page.tsx`** renders `<Board/>` (client component) inside the shell + top bar (wordmark, `ThemeToggle`, sync/synced placeholder — filled in Task 11).
- [ ] **Step 4: Run** `npm test -- test/card.test.tsx` → PASS.
- [ ] **Step 5: Verify live** — seed a few items via `POST /api/import` (curl), load `localhost:3000`, confirm the board renders and matches the reference look. Screenshot.

---

## Task 10: Detail sheet + delete

**Files:**
- Create: `components/detail/detail-sheet.tsx`, `components/detail/pr-row.tsx`, `components/detail/checklist.tsx`, `components/modals/delete-confirm.tsx`, `hooks/use-item.ts`
- Test: `test/pr-row.test.tsx`

**Interfaces:**
- Consumes: `GET /api/items/:id`, `PATCH /api/checklist/:id`, `DELETE /api/items/:id`. Produces: the detail sheet (shadcn `Sheet`, right side) showing grouped sources (Base PRs / Stacked fixes / Docs / Links), merge-order badges, targets, per-PR **state tags with `open`/`draft` fallback**, **conflict tag** (`mergeable==='conflicting'` → red "conflicts"), **comment badges** (`💬 N`, and amber "N unresolved" when `unresolved_threads>0`), the pre-merge checklist (tickable), and delete-with-confirm. Port grouping/markup from `../deck/src/public/app.js renderDetail`.

- [ ] **Step 1: Write `test/pr-row.test.tsx`** — render `<PrRow src={…}/>`: shows `repo #number`, title, target; `open` tag when no review/checks/merged; `✓ approved` when review approved; **`conflicts` tag when `mergeable==='conflicting'`**; **`N unresolved` when `unresolved_threads>0`**. Run to fail.
- [ ] **Step 2: Implement** the sheet + rows + checklist + delete-confirm (shadcn `Sheet`/`Dialog`/`Button`), porting the grouping + tag logic from the reference and adding conflict/comment tags. Clicking a card opens the sheet; PR/link rows open URLs in a new tab.
- [ ] **Step 3: Run** `npm test -- test/pr-row.test.tsx` → PASS.
- [ ] **Step 4: Verify live** — open a multi-PR item; confirm grouping, order badges, tags, conflict/comment badges, checklist toggle, and delete flow. Screenshot.

---

## Task 11: New-item dialog, filters, search, sync UI

**Files:**
- Create: `components/modals/new-item-dialog.tsx`, `components/filters/filter-bar.tsx`, `components/top-bar.tsx`, `hooks/use-sync.ts`
- Modify: `app/page.tsx` (wire top bar)
- Test: `test/filter-bar.test.tsx`

**Interfaces:**
- Consumes: `POST /api/items`, `POST /api/items/:id/sources`, `POST /api/sync`. Produces: New-item dialog (title/type/priority/status/next-action + **Slack thread URL** → creates item then links a `slack` source), a filter bar (type + priority chips, single-select toggle) + search input (debounced `q`), a **Sync button** (spinner + "syncing…", calls `/api/sync` then revalidates) and an **auto-sync** timer (~5 min + ~8 s after load) in `useSync`.

- [ ] **Step 1: Write `test/filter-bar.test.tsx`** — render `<FilterBar/>`, click the "Bug" type chip, assert the `onChange` fires with `{type:'bug'}` and the chip shows active. Run to fail.
- [ ] **Step 2: Implement** the dialog (shadcn `Dialog` + form), filter bar (chips), top bar (wordmark, search, synced indicator, Sync button, Filter, + New, ThemeToggle), and `useSync` (POST + SWR `mutate`). Port field/label choices from the reference `renderNewModal`/filter panel.
- [ ] **Step 3: Run** `npm test -- test/filter-bar.test.tsx` → PASS.
- [ ] **Step 4: Verify live** — create a task via the dialog (with a Slack link); filter to Bug; click Sync; confirm auto-sync fires. Screenshot.

---

## Task 12: End-to-end verification

**Files:** none (verification); fix-forward defects in the owning task's files.

- [ ] **Step 1: Full test suite** — `npm test` → all pass. `npm run build` → succeeds.
- [ ] **Step 2: Seed real data** — `curl -X POST localhost:3000/api/import` with a payload of a few PR-backed items (reuse the shapes from `../deck`), then `POST /api/sync` (real `gh`). Confirm states/conflicts/comments populate.
- [ ] **Step 3: Board + detail** — multi-PR initiative shows base/stacked/docs grouping, order badges, PR-progress track on every card, conflict tag on a conflicting PR, unresolved badge where applicable. Single-PR shows `0/1 PR merged`.
- [ ] **Step 4: Theme** — toggle light/dark; both look polished. `status_locked`: set a status manually, re-sync, confirm it holds.
- [ ] **Step 5: Screenshot** the board (both themes) + a detail sheet for the user.

---

## Self-review notes (author)

- Spec coverage: stack/arch → T1,T2,T7,T8; data model incl. new fields → T2; item/source/checklist/import/status semantics → T3–T5; sync incl. **conflicts + comments** → T6; API → T7; theme → T8; board+card+PR-track+badges → T9; detail+grouping+conflict/comment tags+checklist+delete → T10; new dialog+filters+search+sync UI+auto-sync → T11; success criteria → T12. Phase-2/3 features (⌘K, drag-drop, inline edit, tags/views, activity, reminders) are intentionally out of this plan (separate plans).
- Partial-update preservation (the bug fixed in the reference) is a first-class requirement in T4/T5 with a dedicated test.
- API JSON stays snake_case (mapped from Drizzle camel) so payloads match `../deck` and the ported render logic reads the same fields.
- No git: every task ends on green tests, not a commit.
