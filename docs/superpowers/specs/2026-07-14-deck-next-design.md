# Deck-Next — Design Spec

**Date:** 2026-07-14
**Status:** Approved (design), pending implementation plan
**Owner:** abhilash
**Supersedes:** the vanilla `deck/` app (kept as reference; not migrated)

## Problem

Deck (the current vanilla Node + Hono + vanilla-JS app) works well as a personal, local work tracker, but the UI is hand-rolled and hard to extend. I want to rebuild it on a modern React foundation (Next.js) so the UI is nicer and new features (command palette, drag-and-drop, inline editing, tags/views, PR insight, reminders, activity, theming) are practical to add.

## Goals

- Rebuild Deck on **Next.js + React + SQLite** with **feature parity** plus a **better UI** and a set of **new features** (below).
- Stay **local-only, single-user** (runs at `localhost:3000` via `next dev`).
- Keep the existing dark, minimal aesthetic; add a polished light mode.
- Preserve the mental model: Work Items → many Linked Sources (PRs/Slack/DevRev/URLs), multi-PR initiatives with base/stacked/docs structure, `gh`-driven sync.

## Non-goals (this version)

- No hosting / multi-user / auth (local single-user only).
- No CLI — the terminal `deck` CLI is **replaced by a ⌘K command palette** in the web app.
- No data migration — **fresh start**, empty board.
- No multiple boards/projects (single global board).
- No SSR/SEO features (irrelevant for a localhost app).

## Housekeeping

- **Location:** new folder `onlymagic/deck-next/`.
- **Local-only, NO git** — same rule as the current Deck project. Never commit/branch/push. Spec + plan are local files.
- **Runtime:** `next dev` on `localhost:3000`.

---

## 1. Stack & architecture

- **Next.js (App Router) + TypeScript.**
- **Data layer:** SQLite via **`better-sqlite3`** + **Drizzle ORM** (SQLite dialect). DB access is **server-side only** (Route Handlers / Server Components). `next.config` sets `serverExternalPackages: ['better-sqlite3']` (native module, not bundled).
- **API:** **Route Handlers under `/app/api/*`** expose the model as JSON (mirrors the current REST surface; independently testable). A thin **repository/model layer** (`lib/model/*`) holds all Drizzle queries + business logic (import/upsert, status computation) — server and route code are thin adapters over it.
- **Client:** React client components using **SWR** for data fetching, optimistic mutations, and polling (auto-sync). Server Components render the static shell; the board is a client island.
- **UI toolkit:**
  - **Tailwind CSS** (v4) with **CSS-variable design tokens** (the current dark palette) → light mode is a token swap.
  - **shadcn/ui** (Radix primitives) for Dialog, Drawer/Sheet, DropdownMenu, Popover, Tooltip, Badge, etc.
  - **`cmdk`** for the ⌘K command palette.
  - **`dnd-kit`** for drag-and-drop.
  - **`next-themes`** for light/dark (dark default).
  - **`react-markdown`** for markdown notes.
- **Sync:** a server Route Handler (`POST /api/sync`) shells out to **`gh`** (via `execFile`, concurrent), extended to read conflict + review-comment data. No tokens; relies on the user's local `gh` auth.

**Rejected alternatives:** pure Server Actions + RSC + `useOptimistic` (awkward for drag-drop + polling + unit-testing mutations); Tailwind-only hand-built components (too manual for palette/drag/dialogs); tRPC (overkill for local single-user).

### Project layout

```
deck-next/
  package.json  next.config.ts  tsconfig.json  tailwind.config.ts  drizzle.config.ts
  deck.db                         # local sqlite file (gitignored anyway; repo has no git)
  drizzle/                        # generated migrations
  app/
    layout.tsx  page.tsx          # shell + board page (Server Component wrapper)
    globals.css                   # tailwind + CSS-variable tokens (dark/light)
    api/
      items/route.ts              # GET list, POST create
      items/[id]/route.ts         # GET, PATCH, DELETE
      items/[id]/sources/route.ts # POST link a source
      items/[id]/checklist/route.ts
      sources/[id]/route.ts       # PATCH
      checklist/[id]/route.ts     # PATCH/DELETE
      import/route.ts             # POST upsert
      sync/route.ts               # POST gh sync
      views/route.ts              # saved views CRUD (Phase 3)
  lib/
    db.ts                         # drizzle client over better-sqlite3
    schema.ts                     # drizzle table definitions
    model/
      items.ts sources.ts checklist.ts import.ts status.ts views.ts activity.ts
    sync.ts                       # gh fetch + normalize
    types.ts
  components/
    board/ (Board, Column, Card, PrTrack, SourceBadge, LinkChips)
    detail/ (DetailSheet, PrRow, Checklist, ActivityTimeline)
    modals/ (NewItemDialog, DeleteConfirm)
    command/ (CommandPalette)
    filters/ (FilterBar, TagInput, SavedViews)
    ui/ (shadcn-generated primitives)
    theme/ (ThemeToggle, ThemeProvider)
  hooks/ (useItems, useSync, useHotkeys)
  test/ (vitest: model + sync + render/unit)
```

---

## 2. Data model (Drizzle / SQLite)

Carries the current three tables plus additions. All timestamps ISO-8601 text.

### `work_items`
Existing: `id, title, type, status, status_locked, priority, next_action, notes, blocked_reason, tags, created_at, updated_at`. **New:**
- `position` INTEGER — ordering within a column (drag-and-drop).
- `snoozed_until` TEXT NULL — dismiss a "needs attention" nudge until a time.
- `notes` is treated as **markdown**.
- `tags` stays a JSON array (already present).

`type`: feature|bug|oncall|task|chore · `status`: todo|in_progress|in_review|blocked|done · `priority`: p0..p3.

### `linked_sources`
Existing: `id, item_id, kind, external_id, repo, number, url, title, state, role, target_branch, stacked_on, merge_order, meta, last_synced_at`. Dedup `UNIQUE(kind, external_id)`. **New:**
- `mergeable` TEXT NULL — `mergeable` | `conflicting` | `unknown` (from `gh`).
- `comments_count` INTEGER NULL — review + issue comments on the PR.
- `unresolved_threads` INTEGER NULL — unresolved review threads (via `gh api graphql`).

### `checklist_items`
Unchanged: `id, item_id, text, subtext, done, position`.

### `saved_views` (Phase 3)
- `id, name TEXT, filter TEXT (JSON: {status?,type?,priority?,tag?,q?,needsAttention?}), position INTEGER, created_at`.

### `activity` (Phase 3)
- `id, item_id (FK, cascade), type TEXT (created|status|source_linked|pr_merged|pr_conflict|note|checklist), summary TEXT, data TEXT (JSON), created_at`.

**Semantics preserved from current Deck:** idempotent import/upsert by `(kind, external_id)`; `status_locked=1` protects a manually-set status from sync; `blocked` never auto-set; multi-PR aggregate status; **partial updates never clobber unspecified fields** (`updateSource` only writes fields that are `!== undefined`).

---

## 3. Feature designs

### Parity (Phase 1)
Board (5 columns, live), Work Items + Linked Sources, multi-PR initiatives (base/stacked/docs grouping, merge-order badges, targets, per-PR state tags with an `open`/`draft` fallback, PR-progress track on **every** PR-backed card incl. single-PR), pre-merge checklist, detail sheet, New-item dialog (with Slack field), delete-with-confirm, filters (type + priority) + search, clickable PR/Slack links, `status_locked`.

### PR conflicts (Phase 1)
Sync reads `gh pr view --json mergeable,mergeStateStatus`. `mergeable === 'CONFLICTING'` → store `mergeable='conflicting'`. UI: a red **"conflicts"** tag on the PR row (detail) + a small warning dot on the card. Feeds the "needs attention" view (Phase 3).

### PR review comments (Phase 1)
Sync reads comment/review data: `comments_count` from `--json comments,reviews`; `unresolved_threads` via `gh api graphql` (review threads where `isResolved=false`). UI: a **"💬 N"** badge (comments) and, when `unresolved_threads > 0`, a **"N unresolved"** amber badge on the PR row + a dot on the card.

### Light + dark theme (Phase 1)
`next-themes` + CSS-variable tokens. Dark is default; toggle in the top bar and via ⌘K. Both themes derived from the same token names.

### Command palette ⌘K (Phase 2)
`cmdk` dialog. Actions: quick-add task (type title → create), jump to any item (fuzzy over titles), run sync, switch saved view, toggle theme, set filter. Keyboard-first; `⌘K` opens, `Esc` closes.

### Drag-and-drop (Phase 2)
`dnd-kit`. Drag a card to another column → `PATCH status` (sets `status_locked=1`, like today). Reorder within a column → persist `position`. Optimistic UI via SWR mutate; server confirms.

### Inline editing + markdown notes (Phase 2)
Edit title / next-action in place (input on the card/sheet, commit on blur/Enter → PATCH). Notes: a markdown editor in the detail sheet (textarea + `react-markdown` preview).

### Tags + saved views (Phase 3)
Tag input on items (`tags` JSON). Filter bar filters by tag. **Saved views** = named filter presets (`saved_views`), switchable from the filter bar and ⌘K (e.g. "My PRs in review", "Blocked").

### Activity timeline (Phase 3)
Model writes `activity` rows on create/status-change/source-link/pr-merge/pr-conflict. Detail sheet shows a reverse-chronological timeline.

### Reminders / stale nudges (Phase 3)
Computed (no scheduler): a task "needs attention" if a PR is awaiting review **> 3 days**, blocked **> 7 days**, or has conflicts (thresholds are constants, easy to tune). Surfaced as a **"Needs attention"** smart view + a count badge in the top bar. **Snooze** sets `snoozed_until` to hide it for a while.

### Sync (all phases)
`POST /api/sync` gathers all `github_pr` sources, runs `gh` concurrently per PR (`state,isDraft,mergedAt,reviewDecision,mergeable,mergeStateStatus,comments,reviews` + a GraphQL call for unresolved threads), normalizes, and upserts (state/meta/mergeable/comments only — never structural fields). Triggered by a top-bar Sync button and an auto-sync interval (client timer, ~5 min) + shortly after load.

---

## 4. Phases (build order)

- **Phase 1 — Foundation + parity + PR insight + theme.** Next scaffold, Tailwind/tokens, Drizzle + SQLite schema, model layer (items/sources/checklist/import/status), Route Handlers, SWR data hooks, Board + Card + PR-track + SourceBadge, Detail sheet (grouped PRs + state tags + conflicts + comments + checklist), New/Delete, filters + search, `status_locked`, `gh` sync (states + conflicts + comments), light/dark. **← first implementation plan.**
- **Phase 2 — Interactions.** ⌘K command palette, drag-and-drop, inline editing + markdown notes.
- **Phase 3 — Organization.** Tags + saved views, activity timeline, reminders / stale nudges.

Each phase is a separate implementation plan; Phase 1 is planned and built first.

---

## 5. Testing

- **Vitest** for the model layer (items CRUD, import/upsert idempotency + partial-update preservation, multi-PR status aggregation, `status_locked`) and sync normalization (pure `normalizePr`/thread parsing with `gh` output stubbed).
- Route Handlers tested against an in-memory/temp SQLite DB.
- Component render tests for pure render helpers where practical; interactive flows (drag, palette) verified by driving the running app in the browser (learned lesson: DOM/interaction bugs don't show up in unit tests — verify live).

---

## 6. Success criteria (Phase 1)

- `npm run dev` serves the board at `localhost:3000` from a local SQLite DB.
- Feature parity with current Deck: multi-PR initiative (base/stacked/docs + order + checklist), single-PR track, detail sheet, new/delete, filters + search, `status_locked`.
- `gh` sync updates PR **states, conflicts, and review-comment counts**; item statuses recompute; structural fields are never wiped.
- A PR with conflicts shows a red "conflicts" tag; a PR with unresolved review threads shows an "N unresolved" badge.
- Light/dark toggle works and both themes look polished.
