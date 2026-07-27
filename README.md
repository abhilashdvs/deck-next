# Deck

A fast, local-first personal work tracker for engineers juggling many things at once — features, bugs, on-call issues, and **lots of pull requests across many repos**.

Deck pulls the state of your GitHub PRs (via the `gh` CLI — no tokens to manage) and shows everything on one board: what's in review, what's merged, what has **merge conflicts** or **unresolved review comments**, and which multi-PR initiatives (base + stacked + docs) still need work.

> Runs entirely on your machine against a local SQLite file. Single user, no account, no cloud.

## Features

- **Kanban board** — To do / In progress / In review / Blocked / Done, live-updating.
- **Multi-PR initiatives** — group base / stacked / docs PRs under one task, with merge-order badges, target branches, per-PR state, and a progress track (`3 / 9 PRs merged`).
- **PR insight from GitHub** — conflict tags, review-comment counts, and "N unresolved" review-thread badges, refreshed by sync.
- **Any source per task** — GitHub PRs, Slack threads, DevRev items, or plain URLs, all one click away.
- **`gh`-powered sync** — a Sync button plus auto-sync keep PR states current. No tokens; it uses your existing `gh` auth.
- **Drag-and-drop, ⌘K command palette, inline editing + notes** — keyboard-first, fluid editing.
- **Light and dark themes.**
- **Manual status is protected** — move a card by hand and sync won't override it.

## Tech stack

- [Next.js](https://nextjs.org) (App Router) + React + TypeScript
- [Drizzle ORM](https://orm.drizzle.team) over [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (local `deck.db`)
- [Tailwind CSS](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com)
- [SWR](https://swr.vercel.app) for data + polling, [dnd-kit](https://dndkit.com), [cmdk](https://cmdk.paco.me), next-themes

## Getting started

**Prerequisites:** Node 20+, and the [GitHub CLI](https://cli.github.com) authenticated (`gh auth login`) for PR sync.

```bash
git clone <your-fork-url> deck
cd deck
npm install
npm run dev
```

Open **http://localhost:3000**. Your data lives in a local `deck.db` file (git-ignored).

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app at `localhost:3000` |
| `npm run build` | Production build |
| `npm test` | Run the Vitest suite |

## How sync works

Deck shells out to your local `gh` for each linked PR (`gh pr view … --json state,mergeable,comments,reviews` + a GraphQL call for unresolved threads), normalizes the result, and upserts it — updating PR **state, conflicts, and comment counts** while never disturbing the base/stacked/docs structure you set. There are no API tokens in the app.

## Roadmap

- **Now:** feature-complete local board (above).
- **Next:** tags + saved views, activity timeline, reminders / stale-item nudges.
- **Later:** an optional hosted, multi-user mode (Drizzle makes SQLite → Postgres a driver swap).

## License

[MIT](./LICENSE)
