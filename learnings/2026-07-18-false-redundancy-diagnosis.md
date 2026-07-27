# The "duplicate" field was the only one explaining why checks failed together

## Approach

The failing-checks panel printed three strings per expanded check:

```
Ready For Review Label Added        ← check name
Labels Added · failure · attempt 1  ← run.name
failed at Reay For Review Label…    ← job.failedStep
```

Diagnosing the clutter, I wrote that the run name was "redundant with the check name" and
put its removal in the design the user approved. That was wrong, and I only caught it
while reading the tests before editing — `test/run-panel.test.tsx` asserts
`getByText(/CI/)` against a fixture whose `run.name` is `"CI"` and whose job is `"Lint"`.
Two different strings. The assertion would not have survived a field that was genuinely a
duplicate.

`run.name` is the **workflow** name; the check name is the **job** name. In the real data
they look similar only by coincidence of naming — `Labels Added` is the workflow, and
`Ready For Review Label Added` / `Dev Testing Started Label Added` / `E2E Label Added` are
three jobs inside it. Which makes the workflow name the most valuable fact on the line:
it is *why* those three checks fail as a group. One broken workflow, not three broken
checks. Deleting it would have removed the only field that explains the correlation.

The genuine near-duplicate was `job.failedStep`, which GitHub usually names after the
check. That one collapses — on **exact** match only, because the live data contains
`Reay For Review Label Added`, a typo in the workflow definition. A fuzzy match would
have hidden a string that differs from the check name in a way worth seeing.

## Judgment calls

- **Told the user the earlier reasoning was wrong rather than quietly keeping the field.**
  They approved a design containing a false premise. Silently doing the better thing would
  have left them believing the panel drops a field it does not.
- **Did not use fuzzy/normalised comparison for the step.** It would collapse the typo
  case, and a step name that *nearly* matches its check is a real signal — someone's
  workflow has a mistake in it. Exact match, and near-misses render.
- **Let the test fixture arbitrate.** The fixture's `run.name: "CI"` next to job `"Lint"`
  is a recorded decision about what those fields mean, made when the data model was
  fresh. It outranked my reading of one screenshot where the two happened to look alike.
- **Did not treat visual similarity as evidence of semantic duplication.** Two fields
  rendering similar-looking strings in one sample is a coincidence until you check what
  produces them.

## Reusable rule

Before deleting a field as redundant, find the code or data that produces it and confirm
the two values come from the same source — strings that look alike in one sample often
come from different levels of a hierarchy, and the "duplicate" is frequently the one
carrying the grouping information. When you do collapse a near-duplicate, prefer exact
equality: the cases where two values *almost* match are usually the interesting ones.
