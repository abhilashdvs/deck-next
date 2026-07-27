# An unpaginated `gh api` call made a button disappear instead of erroring

## Approach

`app/api/actions/run/route.ts` fetched a workflow run's jobs with:

```ts
const { jobs } = await ghJson<{ jobs: GhJob[] }>(["api", `${base}/jobs`]);
```

GitHub caps that endpoint at **30 jobs per page** by default. The failure is not an error — it is a silent truncation whose damage lands somewhere else entirely:

1. A matrix run has 40 jobs; the one the user clicked is at index 34.
2. `run.jobs` holds only the first 30.
3. In `failing-checks.tsx`, `run.jobs.find(j => String(j.id) === actionsRef.jobId)` returns `undefined`.
4. `job?.failedStep` is undefined, so the "failed at &lt;step&gt;" row does not render — **and neither does the entire "re-run job" button**, because it lives inside that block.

The user sees a pipeline panel that renders perfectly and simply has no per-job re-run control, and concludes the job isn't re-runnable. Nothing logs, nothing throws, no test fails.

Fix: `${base}/jobs?per_page=100`.

**Do not reach for bare `--paginate`.** `gh api --paginate` concatenates the JSON documents from each page, so a single `JSON.parse` (which is what `ghJson` does) throws on the second document. If more than 100 is ever genuinely needed, the correct form is `--paginate --slurp`, which wraps the pages in one array — and the response shape changes accordingly, so callers must change too.

## Judgment calls

- **Chose `per_page=100` over real pagination.** A run with >100 jobs is far rarer than one with >30, the fix is one query parameter with no response-shape change, and the alternative drags in `--slurp` plus a shape migration. Logged the remaining >100 edge in the ledger explicitly rather than leaving the ceiling undocumented — a bounded fix you have written down is honest; one you haven't is a trap.
- **Did not add a "some jobs hidden" warning.** That treats the symptom while leaving the truncation in place, and the truncation is what breaks the button.
- **Asserted the argv in a test** (`per_page=100` present, `--paginate` absent) rather than only the parsed result. The `--paginate` prohibition is the part a future reader is most likely to "helpfully" undo, so the test has to encode the prohibition, not just the outcome.

## Reusable rule

Any paged API call that feeds a `.find()` fails silently by construction — the missing record becomes a missing UI affordance, not an error — so set an explicit page size at the call site rather than inheriting a default you never chose. And check how the client's pagination flag reshapes the response before using it: a flag that concatenates documents will break any single-parse consumer.
