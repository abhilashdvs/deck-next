# Failing-checks panel redesign

**Goal:** Make the failing-checks / re-run panel readable. Presentation only — no API, hook, or data-model change.

**Scope:** `components/detail/failing-checks.tsx`, `test/failing-checks.test.tsx`, `test/run-panel.test.tsx`.

## The problem

`pr-row.tsx:25` states the rule the surrounding card follows: *"Colour is reserved for
whichever fact most needs attention."* The panel breaks it. Check names, step names,
every error line and every job mark all render in `st-blocked`, so nothing reads as
urgent and the card becomes a wall of red monospace.

Three things compound it:

1. **Repetition.** The check name, the failed step, and (near-)identical strings print
   together. The run name is *not* a duplicate — it is the workflow, and it explains why
   sibling checks fail together — but the step usually is.
2. **Wrapping actions.** Three re-run buttons sit in an `ml-auto` flex-wrap row, so they
   break onto their own line and `re-run job` collapses into a two-line box. Two expanded
   checks put six buttons on screen.
3. **Job soup.** Every job's full name renders as wrapping text with no separators.

## Design

**Row.** `[chevron] [dot] name … [↻ Re-run ▾] [↗]`. The dot is `st-blocked`, 5px, and is
the only red at rest. The name returns to `text-foreground`. Checks where
`parseActionsUrl` returns null get the dot and `↗` but no chevron and no re-run control —
the absent chevron remains the single signal for "not actionable".

**Expanded body**, indented under a 1px neutral rule:

- the always-mounted live region;
- a faint meta line: `{run.name} · attempt {n}`, plus ` · failed at {step}` when the step
  exists and is not exactly equal to the check name;
- the log block — `bg-st-blocked/[0.07]`, 2px `st-blocked` left border, square corners,
  error text in `st-blocked` mono. Containment is what stops GitHub's output competing
  with deck's chrome;
- `also failed` naming sibling failed jobs, then a dot strip representing every job in
  the run, each dot carrying `title` and `aria-label` of `{name} · {conclusion}`.

**Actions.** One `↻ Re-run ▾` control. The menu offers `This job` / `Failed jobs` /
`Whole run`. Picking an item fires nothing — it sets `confirming` to that scope and the
control becomes `Re-run this job? · Yes · Cancel`. Scope selection and intent
confirmation stay separate steps because a menu pick is not consent to spend CI.

**Expansion stays independent** — no accordion, preserving the per-child `useState` and
the "independently expandable" test.

## Invariants

These are load-bearing and a visual refactor is where they get silently dropped:

- The four-way log branch order: `errorsLoading` → `errors.length > 0` → `failed` →
  clean. Collapsing it makes a loading or failed fetch render an affirmative all-clear.
- A single, always-mounted `role="status"` node rendering `{rerunError ?? rerunOk}`. Not
  two nodes, not conditionally mounted, no `empty:hidden`.
- `fire()`'s `fired` flag; `refresh()` stays outside the `try`.
- No denominators. `also failed` names jobs and never counts them; the dot strip carries
  no numeric label.
- The `a`-inside-`a` guard in `test/pr-row.test.tsx`.
- No test may fire a real re-run. POST paths are asserted against a mocked `global.fetch`.

## Testing

Existing assertions change; guarantees do not.

- Re-run tests gain a menu step: open `↻ Re-run`, pick the scope item, then confirm.
- "lists every job" becomes an assertion on the dot strip's accessible names rather than
  on rendered text.
- New coverage: opening the menu fires no request; picking a scope fires no request;
  only `Yes` does.
