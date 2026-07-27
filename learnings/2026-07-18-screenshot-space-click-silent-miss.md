# A click with the wrong coordinate space looked like a broken feature

## Approach

Verifying the redesigned re-run menu in the browser, I hit-tested the control first:

```js
const r = btn.getBoundingClientRect();          // → [1315, 343, 74, 18]
const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
```

It hit itself — the stretched-link overlay was not swallowing it. So I clicked the
centre, `(1352, 352)`, with the browser tool's `coordinate` argument, then queried the
DOM. The menu was closed *and* `button[aria-haspopup=menu]` had vanished entirely.

That reads exactly like "the menu doesn't open and the panel collapsed on click" — a real
bug in the component. It wasn't.

`getBoundingClientRect` returns **CSS/page pixels** (viewport 1440×960). The browser
tool's `coordinate` argument is in **screenshot-pixel space**, and the returned screenshot
was 800×533. So `(1352, 352)` was interpreted as a point in an 800-wide image — roughly
`(2434, 634)` in page terms, off to the side. The click landed on the backdrop, which
closed the detail sheet. Nothing errored. The state I then read back was real, it just
described a different UI than the one I thought I was driving.

The fix is not arithmetic — don't scale the numbers. Click by **`ref`**, which the tool
resolves itself:

```
computer{action: "left_click", ref: "ref_78"}   → left_click at (1392, 352) [ref_78]
```

That opened the menu, `aria-expanded` went `true`, and all three `menuitem`s appeared.

## Judgment calls

- **Did not "fix" the component after the first failed click.** Two independent signals
  agreed it was broken (menu absent, toggle gone), and both were downstream of the same
  bad click. Before editing anything, I checked whether the *input* was valid — the tool
  description says screenshot-pixel space in the first sentence.
- **Did not switch to synthetic `.click()` when the real click misbehaved.** That would
  have "passed" while proving nothing about trusted-event handling, which is the only
  reason to drive a browser at all. Refs give a trusted click without the coordinate
  problem.
- **Kept the `elementFromPoint` hit-test even though it uses the other space.** It is
  correct there — it is a DOM API consuming DOM coordinates. The mistake was carrying its
  output across an API boundary into a tool that measures differently.
- **Verified "fires nothing" from the network log, not from the absence of a visible
  change.** `read_network_requests{urlPattern: "rerun"}` returning empty after opening the
  menu and after picking a scope is the actual evidence; a UI that looks idle is not.

## Reusable rule

Coordinates are not portable across API boundaries. Before feeding a measurement from one
system into another, check that both agree on the unit and origin — screenshots are often
downscaled from the viewport, so page-pixel coordinates silently land somewhere else. And
when an action produces a plausible-looking wrong state rather than an error, suspect the
input to the action before you suspect the code under test: a mis-aimed click still
clicks something.
