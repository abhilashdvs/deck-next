# The plan's checklist demanded behaviour the plan's own code could not implement

## Approach

Live verification of the finished feature turned up an apparent failure. The plan's Step 5 checklist said:

> Only one check expands at a time; collapsing works.

Clicking two failing checks left **two** panels open. That reads like a straightforward defect — until you check what the rest of the plan mandates.

- Plan line 942 specifies the implementation verbatim: `const [open, setOpen] = useState(false)` **inside** `FailingCheck`, i.e. state local to each row.
- Plan line 891 requires a test named "keeps both same-named checks **independently expandable**".
- The design spec never mentions an accordion at all.

State local to each child *structurally cannot* implement an accordion — there is no shared parent state through which one row could close another. The plan's own mandated code makes its own checklist line unimplementable. So the implementation was correct and the prose was wrong.

One piece of near-evidence had to be discarded. Plan line 868, "expands only the clicked check" (one click → one panel), initially looked like support for independent state — but an accordion satisfies that assertion equally well, so it discriminates nothing. The decisive evidence was the mandated `useState` placement and the word "independently," not the test that appeared to be about it.

Resolution: adjudicate and record, change no code. Line 1468 is loose checklist prose that meant "clicking one check doesn't expand the others" and compressed into a sentence that reads like an accordion constraint.

## Judgment calls

- **Did not "fix" the code to match the prose.** Lifting state into a parent would have broken the mandated implementation and an explicit test, to satisfy one unsourced sentence in a verification checklist.
- **Did not silently ignore the mismatch** either. A plan contradicting itself is the human's call, so it went into the ledger with both sides quoted and the reasoning shown, flagged for final-review triage. It was confirmed there independently.
- **Went looking for the requirement's origin** rather than ranking the two plan lines by which sounded more authoritative. The spec's silence on accordion behaviour is what settled it — the constraint had no source.
- **Discarded my own strongest-looking argument** once it turned out an accordion satisfied line 868 too. An argument that both hypotheses satisfy is not evidence, however convenient.

## Reusable rule

When a plan contradicts itself, weight its artifacts by how specific they are: mandated code and named tests encode a decision someone actually made, while checklist prose is a paraphrase written later and is where drift accumulates. Before acting on either, find where the requirement originated — a constraint absent from the spec is usually restatement gone wrong — and check that your evidence actually discriminates between the competing readings rather than being satisfied by both.
