# Three claims that looked verified were actually verified by proxy

## Approach

Three separate "confirmed" facts in this feature turned out to rest on a stand-in for the real thing rather than the thing itself.

**1. Clickability under a stretched-link overlay.** `PrRow` uses the stretched-link pattern — the card is `relative`, an anchor's `::after {absolute inset-0}` covers it. The new re-run buttons sit inside that card with `relative z-10`. Whether the overlay swallowed their clicks had been reasoned out from the CSS 2.1 Appendix E paint order, and a passing nested-anchor test was treated as corroboration. Neither actually observes a click.

The real check is the browser's own hit-test:

```js
const r = el.getBoundingClientRect();
const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
const reachable = el === hit || el.contains(hit);
```

10/10 controls hit themselves — the overlay does not swallow them.

**Watch the false negative:** `elementFromPoint` returns `null` for a point *outside the viewport*. Two controls first reported as "blocked" with a null hit and no tag; both hit themselves once scrolled into view. A null result means "not on screen," not "covered" — distinguish them before believing you found a bug.

**2. Fetch-on-expand.** Synthetic `.click()` via injected JS is not the same event a user produces. A real trusted click through the browser-control tool fired exactly two GETs (`/api/actions/run`, `/api/actions/errors`), both 200 — that is what proves the wiring, not the synthetic version.

**3. A subagent's test results.** The fix subagent reported `npx vitest run ... --reporter=basic` → PASS 195. Vitest 4 *removed* the `basic` reporter; that command errors out before running anything. The quoted invocation could not have produced the quoted number. Re-running it properly gave 195/195 — the count was right, the command was fiction.

## Judgment calls

- **Did not accept the passing nested-anchor test as evidence of clickability.** It proves valid DOM nesting. Nothing about it exercises hit-testing, and treating adjacent green as coverage is how the gap survived two review rounds.
- **Did not fire the one real re-run to prove `actions: write`.** It was offered at an explicit gate and the developer declined. So that scope stays *inferred* from `push: true` — recorded as unproven in the ledger rather than quietly assumed. An untested path documented as untested is fine; one assumed to work is not.
- **Did not re-derive the subagent's whole diff by hand** after catching the bad command. Spot-checked the five changed hunks in source, then re-ran the suite, tsc, eslint and build myself. The report's *claims* were the thing under suspicion, not its work.
- **Ran the browser check against a fresh tab, not `location.reload()`** — reload does not clear the console buffer, so old warnings masquerade as current ones.

## Reusable rule

Before recording something as verified, name the artifact the evidence actually touched. Reasoning about CSS is not a hit-test, a synthetic event is not a user click, an adjacent green test is not coverage, and a quoted command is not a command that ran — when the stand-in is cheap to replace with the real thing, replace it, and when it isn't, write down that the claim is inferred.
