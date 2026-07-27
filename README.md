# Deck

**A fast, local kanban board for engineers who juggle lots of pull requests.**

Deck runs entirely on your machine. It tracks your features, bugs, and tasks on one board — and it talks to GitHub to show the *live state* of every PR you've linked: merged or open, failing checks, merge conflicts, unresolved review comments.

No account. No cloud. No tokens to manage. Just a local app and your existing `gh` login.

![Deck board](docs/screenshots/board-dark.png)

## What it does

**Everything on one board.** Five columns — To do, In progress, In review, Blocked, Done. Drag cards between them. Each card shows its PRs, how many are merged, and a progress bar.

**Live PR status from GitHub.** Hit sync (or let auto-sync do it) and every linked PR updates: state, failing checks, conflicts, and unresolved review threads. Cards that need your attention get flagged.

**Big work, many PRs.** One task can hold a whole initiative — a base PR, stacked PRs on top of it, and a docs PR — each with its own target branch, review state, and merge order:

![Task detail with stacked PRs](docs/screenshots/detail-sheet.png)

**Keyboard-first.** Press `⌘K` for the command palette — search tasks, sync, switch themes, jump anywhere:

![Command palette](docs/screenshots/command-palette.png)

**Light mode too** (plus Midnight, Dracula, and Rosé Pine):

![Light theme](docs/screenshots/board-light.png)

A few more nice things:

- Paste any link on a card — a GitHub PR, a Slack thread, a ticket, any URL.
- Move a card by hand and sync **won't** override your choice.
- Re-run failing GitHub Actions jobs and read their logs without leaving the board.
- Your data is one SQLite file (`deck.db`) sitting next to the code. Back it up by copying it.

## Set it up locally

You need two things:

1. **Node.js 20 or newer** — [download here](https://nodejs.org)
2. **GitHub CLI** (only needed for PR sync) — [install here](https://cli.github.com), then log in once with:

```bash
gh auth login
```

Then run:

```bash
git clone https://github.com/abhilashdvs/deck-next.git
cd deck-next
npm install
npm run dev
```

Open **http://localhost:3000** — that's it. Click **+ new** to add your first task, then paste a PR URL into it.

> Don't use GitHub, or not logged into `gh`? Everything still works — you just won't get live PR status.

### Optional: PR shorthand

Typing a full PR URL works everywhere. If you want the short form too (`myrepo#123`), tell Deck which GitHub org/user to assume by creating a `.env.local` file:

```bash
echo 'NEXT_PUBLIC_GITHUB_ORG=your-github-org' > .env.local
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app at `localhost:3000` |
| `npm test` | Run the test suite |
| `npm run build` | Production build |

## How sync works (30 seconds)

When you sync, Deck asks your local `gh` CLI about each linked PR — state, checks, conflicts, review comments — plus one GraphQL call for unresolved review threads. Results are saved into `deck.db` and the board updates. Deck never stores a GitHub token; it simply uses the `gh` login you already have.

## Tech stack

[Next.js](https://nextjs.org) · React · TypeScript · [Drizzle ORM](https://orm.drizzle.team) over SQLite ([better-sqlite3](https://github.com/WiseLibs/better-sqlite3)) · [Tailwind CSS](https://tailwindcss.com) · [shadcn/ui](https://ui.shadcn.com) · [SWR](https://swr.vercel.app) · [dnd-kit](https://dndkit.com) · [cmdk](https://cmdk.paco.me)

## License

[MIT](./LICENSE)
