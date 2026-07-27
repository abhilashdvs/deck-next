# One observable state meant three different realities, and the UI picked the reassuring one

## Approach

Two separate bugs in `components/detail/failing-checks.tsx` turned out to be the same bug wearing different clothes.

**First instance — the log panel.** `useJobErrors` (in `hooks/use-run.ts`) returns `errors: []` for three genuinely different realities: the fetch is still in flight, the fetch died, and the log is genuinely clean. The render had one branch for "no markers in this log" and it fired for all three. So a log still loading, and a log whose fetch 502'd, both displayed an affirmative all-clear.

Fixing it needed the branch order to become load-bearing, in this exact sequence:

1. `errorsLoading` first — a request in flight may never claim anything about content.
2. `errors.length > 0` next — this one is counterintuitive and was missed on the first fix round. SWR *keeps* cached `data` when a revalidation errors, so `errors` non-empty and `failed === true` co-occur. Real lines we already hold outrank the news that a refetch failed.
3. `failed` next — fetch died, say so.
4. Only then "No error markers in this log."

**Second instance — the re-run button.** GitHub's rerun endpoint returns 201 and flips the run *asynchronously*. `fire()` called `refresh()` once, immediately, and nothing polled afterward. So on success the header still read `completed · failure · attempt 1`, no error text, no success text — byte-identical to a dead button. The user's natural next move is to click again, spending a second real CI run on shared infrastructure. That is precisely the waste the feature was built to prevent.

The unifying diagnosis: in both cases a single observable state covered multiple realities, and the code resolved the ambiguity toward the *reassuring* reading.

## Judgment calls

- **Did not add polling** for the async run transition. An interval would have to run per open panel against a rate-limited API, and it only shortens a window that affirmative text closes outright. Cheap honest feedback beat expensive eventual accuracy.
- **Did not use `useEffect`** to clear the message. The repo's eslint already flags `react-hooks/set-state-in-effect` in seven files; adding another instance to solve a problem the existing event handlers could solve was trading a real lint debt for nothing.
- **Rendered success and error through the SAME `role="status"` node** as `{rerunError ?? rerunOk}`, rather than two sibling regions. Mutual exclusion becomes structural — you cannot render both at once even by mistake — and `??` makes the error win, which is the safe direction.
- **Kept the live region always mounted** with empty text rather than conditionally rendering it. A live region only announces mutations if it is already in the DOM when the text arrives; mounting it alongside its message means screen readers announce nothing. For the same reason, no `empty:hidden` — that removes it from the a11y tree and defeats the fix.
- **Accepted the stale-message-timing nit.** `fire()` already clears both messages up front. Clearing them earlier (on confirm-open) would only yank text off screen while the user is still reading it.

## Reusable rule

When one observable value (an empty array, an unchanged status, a null) can mean several different things, enumerate every reality it covers and make the render branch on them explicitly — and when the states are ordered, put the ones that may not claim success first. Resolving an ambiguous state toward the reassuring interpretation is how a UI tells a confident lie; if the ambiguity sits in front of a side-effectful button, the lie costs the user a duplicate write.
