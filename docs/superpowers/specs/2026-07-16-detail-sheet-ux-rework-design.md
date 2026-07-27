# Detail sheet UX rework — design

**Date:** 2026-07-16
**Status:** Approved, ready for implementation planning
**Scope:** deck-next

## Problem

Screenshots of a real item (`1CC auth-configs decomp`, 9 PRs across 4 repos) surfaced concrete damage from the required-checks feature landing on top of an already-dense sheet:

1. Failing-check chips render as a loose block **below** each PR card, overflowing the card's left edge — the sibling-of-the-anchor structure chosen to avoid a nested `<a>`.
2. Up to four colour-filled pills compete on one PR row (`conflicts` / `required passing` / `review` / `N unresolved`) with no hierarchy — everything shouts.
3. Long check names (`Ready For Review Label Added`, `github/combined-status-check`) wrap across 2-3 lines.
4. The activity log repeats `Conflicts on magic-checkout-service #3189` seven times (2h/4h/5h/7h/11h/1d/1d) plus three more for a PR that has since merged — GitHub's transient `mergeable: UNKNOWN` is being written as a real state change.
5. Three always-empty rows (next action, blocked reason, tag) plus an empty notes box consume ~120px above the PR list on a typical item.
6. Stacked-PR targets like `→ magic-checkout-service#3189` are long enough to squeeze a sibling row's `repo #number` onto three lines.

## Goals

- Failing checks render inside the PR card, never detached from it.
- One PR row communicates its state in one skimmable line, not four pills.
- Long check names truncate instead of wrapping.
- The activity log stops recording false conflict changes, and existing junk rows are purged.
- Empty optional fields don't consume permanent vertical space.
- Stacked-PR target labels don't force sibling rows to wrap.

## Non-goals

- No section/tab restructuring of the sheet (Overview / PRs / Activity). Out of scope per the chosen "rework the PR row + targeted fixes" scope.
- No change to the board card or the needs-attention logic — this is detail-sheet only.
- No display-side collapsing of repeated activity events (e.g. "×3"). The root-cause fix removes the false-repeat case; genuine repeats are expected to be rare enough not to need it.
- No visual companion assets ship as code — the approved mockups (Option B) are the reference; production values come from the repo's actual CSS variables, not the mockup's hardcoded hex.

## Decisions

| Decision | Choice |
| --- | --- |
| PR row layout | Option B: nested failing-check list inside the card, uncapped (every failure shown, no "+N more") |
| Row structure | Stretched-link pattern — the `repo #num` anchor gets `::after` covering the card; failing-check links sit inside as real DOM siblings, above the overlay via `z-10` |
| Meta line | One line, `·`-separated, `text-faint` by default; colour only on the item that needs attention (red for conflicts/failing/changes-requested, amber for pending, green icon for passing) |
| Activity root cause | `normalizePr` maps GitHub's `UNKNOWN` mergeable to `undefined`, not the string `"unknown"` — `updateSource`'s existing `!== undefined` guard then preserves the last known value instead of overwriting it |
| Activity conflict logging | Never log `pr_conflict` when the PR is merged or closed |
| Existing junk | One-time DB purge of duplicate `pr_conflict` rows (keep newest per item+summary), after backing up `deck.db` |
| Empty fields | Next action / tag / notes collapse into one `+ next action · tag · note` row when all three are empty; any field with content renders normally; `blockedReason` prompt is unaffected (always shown while `status === "blocked"`) |
| Stacked target label | `→ repo#num` abbreviates to `→ #num` when the target is in the same repo as the row |

## Architecture

Four independent seams:

1. **`components/detail/pr-row.tsx`** — full rewrite of the row's DOM structure and the meta-line logic.
2. **`lib/sync.ts`** — one-line semantic fix (`normalizePr`'s mergeable mapping).
3. **`lib/model/import.ts`** — one added guard on the conflict-logging branch.
4. **`components/detail/detail-sheet.tsx`** — extraction of two components it currently inlines, to host the new empty-field collapse without growing the 417-line file further.

## 1. `pr-row.tsx` — structure and meta line

### Stretched-link pattern (replaces the Task-5 sibling-block structure)

The current structure wraps the whole row in one `<a>` (`Wrapper = url ? "a" : "div"`), which is why failing-check links can't live inside it — hence last time's sibling block below the card. The fix:

```tsx
<div className="group/pr relative rounded-[10px] border border-hairline bg-card p-2.5 transition hover:bg-card-hover">
  <div className="flex items-center gap-2">
    <span className="pip" />
    {url ? (
      <a href={url} target="_blank" rel="noreferrer"
         className="relative z-10 font-mono text-[12px] text-foreground after:absolute after:inset-0 after:content-['']">
        {idText}
      </a>
    ) : (
      <span className="font-mono text-[12px] text-foreground">{idText}</span>
    )}
    {targetLabel && <span className="ml-auto ...">{targetLabel}</span>}
  </div>
  {title && <div>{title}</div>}
  <MetaLine .../>
  {failed.length > 0 && <FailingChecks failed={failed} />}
</div>
```

The `::after` pseudo-element on the id anchor is absolutely positioned to `inset-0`, stretching its click target to the full card — clicking anywhere on the card still opens the PR, matching current behaviour. Any element that must itself be clickable (the failing-check links, the existing hover-only role-select/remove controls in `detail-sheet.tsx`) needs `relative z-10` to sit above the stretched overlay. This is the standard "block link" pattern for exactly this conflict — real link semantics (open-in-new-tab, copy link, middle-click) on the id, without an `<a>` wrapping the whole card.

If `url` is empty, the id renders as a plain `<span>` (as today) and no stretched-link is needed — nothing inside needs to out-rank a link that doesn't exist.

### Meta line

Replaces `stateTags`' pill array with a single-line, mostly-neutral summary. One `MetaItem` = plain text in `text-faint`, except the item that most needs attention, which gets colour:

| Condition | Item | Colour |
| --- | --- | --- |
| `state === "merged"` | `merged` | `text-st-done` |
| `state === "closed"` | `closed` | `text-faint` (no colour — not actionable) |
| `mergeable === "conflicting"` | `conflicts` | `text-st-blocked` |
| checks failing | `N checks failing` | `text-st-blocked` |
| checks failing === 0, pending > 0 | `N checks pending` | `text-st-review` |
| checks failing === 0, pending === 0, required > 0 | `checks passing` | icon only (`Check`, `text-st-done`), no coloured text — a passing state shouldn't compete visually with a problem state |
| `review === "changes_requested"` | `changes requested` | `text-st-blocked` |
| `review` includes `approv` | `approved` | icon only, same treatment as passing |
| `review` includes `requir` | `review` | `text-faint` |
| no primary state at all | `open` / `draft` | `text-faint` |
| `unresolvedThreads > 0` | `N unresolved` | `text-faint` unless it's the ONLY signal present, then `text-st-review` |

At most one red/amber item per row in the common case; `conflicts` and `N checks failing` can both be true and both render (that is real, simultaneous bad news — the design does not hide it, it just stops decorating the six other neutral facts with the same visual weight). Rendered as plain inline text joined by a `·` separator, e.g.:

```
conflicts · checks passing · review · 9 unresolved
```

No `TAG_CLS`, no pill backgrounds. This replaces `stateTags`/`TAG_CLS` entirely — kept only where a specific item still needs an icon (passing/approved checkmarks).

### Failing checks (nested, uncapped)

```tsx
function FailingChecks({ failed }: { failed: { name: string; url: string | null }[] }) {
  return (
    <div className="relative z-10 mt-1.5 flex flex-col gap-0.5 border-l-2 border-st-blocked/35 pl-2.5">
      {failed.map((f, i) => {
        const Tag = f.url ? "a" : "span";
        return (
          <Tag
            key={i}
            {...(f.url ? { href: f.url, target: "_blank", rel: "noreferrer" } : {})}
            title={f.name}
            className={`truncate font-mono text-[11px] text-st-blocked ${f.url ? "hover:underline" : ""}`}
          >
            {f.name}
          </Tag>
        );
      })}
    </div>
  );
}
```

`border-radius: 0` on the rule (per project convention: no rounded corners on a single-sided border). `truncate` (Tailwind's `overflow-hidden text-ellipsis whitespace-nowrap`) keeps every entry to one line; `title={f.name}` exposes the full string on hover. Uncapped — every failing check renders, per the approved decision. Still keyed by array index, never de-duplicated (unchanged from the existing constraint — two checks can share a name, e.g. the real `Lint`×2 case, and each needs its own link).

### Stacked target abbreviation

`detail-sheet.tsx`'s `ROLE_META` currently gives every stacked PR the literal string `"→ base PR branch"` as its target, and `PrRow` reads `src.targetBranch` directly for the label. Neither carries the *actual* target PR number today — `patchSource` writes the placeholder string, not `stackedOn`. Real per-PR target abbreviation therefore needs the real target, which requires reading `src.stackedOn` (already a column, currently unused by `PrRow`) when set, falling back to `targetBranch`:

```ts
function targetLabel(s: LinkedSource): string | null {
  if (s.stackedOn) {
    const [repo, num] = s.stackedOn.split("#");
    return repo === s.repo ? `→ #${num}` : `→ ${s.stackedOn}`;
  }
  return s.targetBranch ? `→ ${s.targetBranch}` : null;
}
```

If `stackedOn` is unset (the common case today, since the UI doesn't yet collect it), this falls back to today's `targetBranch` string unchanged — no regression, and the abbreviation activates automatically once `stackedOn` starts being populated. Wiring `stackedOn` collection into the UI is out of scope here (not requested, and a separate concern from this rework); this decouples the abbreviation logic from that future work so it activates for free when it lands.

## 2. `lib/sync.ts` — stop `UNKNOWN` from clobbering `mergeable`

Current (`lib/sync.ts:25-26`):

```ts
const m = (d.mergeable ?? "").toUpperCase();
const mergeable = m === "MERGEABLE" ? "mergeable" : m === "CONFLICTING" ? "conflicting" : "unknown";
```

GitHub returns `mergeable: UNKNOWN` while it's still computing the merge commit asynchronously — this is not a state change, it's "ask again later." Writing it as the string `"unknown"` means `updateSource` (which writes any field `!== undefined`) overwrites a real `"conflicting"` with `"unknown"`, and the next successful sync writes `"conflicting"` again — two activity-triggering transitions per poll cycle for a PR whose actual mergeability never changed.

Fix: return `undefined` instead of the string, so `updateSource`'s existing `!== undefined` guard (already in `lib/model/sources.ts:92-94`) preserves the prior value — no new merge logic needed, this reuses infrastructure that already exists for exactly this purpose.

```ts
export function normalizePr(d: {...}): { state: string; mergeable: string | undefined; commentsCount: number } {
  ...
  const m = (d.mergeable ?? "").toUpperCase();
  const mergeable = m === "MERGEABLE" ? "mergeable" : m === "CONFLICTING" ? "conflicting" : undefined;
  ...
}
```

`ImportRecord.mergeable` (`lib/types.ts:127`) is already `mergeable?: string` — no type change needed there. The existing test `"defaults unknown mergeable"` (`test/sync.test.ts:20-22`) currently asserts the buggy behavior (`.toBe("unknown")`); it is updated to assert `.toBeUndefined()` as part of this fix, with a comment explaining why the assertion changed.

**Consequence for `mergeable === "unknown"` in stored data:** existing rows with `mergeable: "unknown"` already in the DB (a merged PR shows this, per the live data pulled earlier: `magic-checkout-service#3096` merged, `mergeable: unknown`) are untouched by this fix — it only changes what *future* syncs write. `hasConflict`/`PrRow`/etc. never branch on `"unknown"` specially today (only ever check for `=== "conflicting"`), so no consumer needs updating.

## 3. `lib/model/import.ts` — never log conflicts on merged/closed PRs

Current (`lib/model/import.ts:52-54`):

```ts
if (existing.mergeable !== "conflicting" && rec.mergeable === "conflicting") {
  logActivity(tx, itemId, "pr_conflict", `Conflicts on ${label}`);
}
```

A merged PR's `mergeable` is moot — GitHub often reports stale/irrelevant values post-merge — but nothing stops a merged PR's state flip from firing this branch. Add a guard:

```ts
const isLive = (rec.state ?? "").toLowerCase() !== "merged" && (rec.state ?? "").toLowerCase() !== "closed";
if (isLive && existing.mergeable !== "conflicting" && rec.mergeable === "conflicting") {
  logActivity(tx, itemId, "pr_conflict", `Conflicts on ${label}`);
}
```

## 4. One-time purge of existing junk rows

Before any code change ships, back up the live DB, then delete all but the newest `pr_conflict` row per `(item_id, summary)`:

```sql
DELETE FROM activity
WHERE type = 'pr_conflict'
  AND id NOT IN (
    SELECT MAX(id) FROM activity WHERE type = 'pr_conflict' GROUP BY item_id, summary
  );
```

Verified against live data: this removes 6 of the 7 `Conflicts on magic-checkout-service #3189` rows and 2 of the 3 `Conflicts on magic-checkout-service #3096` rows (`#3096` is merged — kept row is now legacy, but is one row, not three), keeping the single newest of each. A manual `cp deck.db deck.db.bak-YYYYMMDD` precedes the `DELETE`, per this project's "confirm before destructive DB operations" norm.

## 5. Empty-field collapse

`detail-sheet.tsx:265-291` renders next action, blocked reason, and tags unconditionally; notes renders unconditionally with its own heading. New behaviour: when `nextAction`, `tags`, and `notes` are **all** empty/unset, render one collapsed row instead of three-plus-heading:

```tsx
function CollapsedFieldsRow({ onReveal }: { onReveal: (field: "nextAction" | "tag" | "note") => void }) {
  return (
    <div className="mt-4 flex items-center gap-1 text-[12px] text-text-faint">
      <button onClick={() => onReveal("nextAction")} className="hover:text-foreground">+ next action</button>
      <span>·</span>
      <button onClick={() => onReveal("tag")} className="hover:text-foreground">tag</button>
      <span>·</span>
      <button onClick={() => onReveal("note")} className="hover:text-foreground">note</button>
    </div>
  );
}
```

Clicking a segment reveals that field's existing full editor in place (the existing `EditableText`/`TagInput`/`NotesEditor` components — reused as-is, not reimplemented) and hides the collapsed row for the rest of that sheet-open session. As soon as any field gains content (via commit), the sheet falls back to rendering all three normally on next open — so a field that's been filled in never goes missing behind the collapsed row. `blockedReason`'s prompt is unaffected: it already only renders `if (item.status === "blocked")`, independent of this collapse, and continues to do so.

## 6. Component extraction

`detail-sheet.tsx` is 417 lines before this change; the stretched-link rewrite of `pr-row.tsx` plus the new collapse-state logic would push it further into one-file-does-everything territory. Two extractions, following the existing `pr-row.tsx`/`add-source.tsx` pattern of one component per concern:

- **`components/detail/item-fields.tsx`** — owns next action, blocked reason, tags, notes, and the new collapse/reveal state. Takes `item` and `onPatch` (the existing `patchItem`), matching how `TagInput`/`NotesEditor` are already used. Replaces `detail-sheet.tsx:265-296`.
- **`components/detail/pr-group.tsx`** — owns one `ROLE_META` group: the section header (label/target/count) and the per-PR hover overlay (role select + remove ×) that currently wraps `PrRow` inline. Takes `role`, `label`, `target`, `sources`, `onPatchSource`, `onRemoveSource`. Replaces `detail-sheet.tsx:298-344`.

`detail-sheet.tsx` becomes composition: header, banners, `<ItemFields item={item} onPatch={patchItem} />`, the `ROLE_META.map` reduced to `<PrGroup key={role} .../>`, links, add-source, checklist, activity. No other section moves — this is targeted, not a full restructure (explicitly out of scope per the approved decision).

## Testing

- **`pr-row.tsx`**: meta-line text for each state combination (merged, conflicts, checks failing, checks pending, checks passing, changes requested, approved, unresolved-only, plain open/draft); `container.querySelectorAll("a a").length === 0` (nesting guard, same check used for the prior sibling-block design — must still hold under the new stretched-link structure); failing checks render as children of the card (`container.querySelector('[data-pr-card] a[href*="failing-url"]')` or equivalent), not as a sibling block; a failing check gets a `title` attribute equal to its name; two same-named failing checks both render with distinct hrefs (regression check — this was Task 5's hardest-won property, must survive the rewrite); `targetLabel` abbreviates same-repo `stackedOn` to `→ #num` and leaves cross-repo/`targetBranch` cases unchanged.
- **`lib/sync.ts`**: `normalizePr` returns `mergeable: undefined` (not `"unknown"`) when GitHub reports `UNKNOWN` or omits the field; still returns `"conflicting"`/`"mergeable"` correctly for those states (regression).
- **`lib/model/import.ts`**: `importSources` does not log `pr_conflict` when `rec.state` is `"merged"` or `"closed"`, even if `mergeable` flips to `"conflicting"`; still logs it for an open PR (regression).
- **`item-fields.tsx`**: renders the collapsed row when all three fields are empty; renders all three normally when any has content; clicking a collapsed segment reveals that field's editor.
- **`pr-group.tsx`**: renders the section header and delegates each source to `PrRow`; role-select and remove-button clicks still call the passed-in handlers (regression for the hover-overlay behavior fixed in the prior session).

## Non-goals restated (scope guard)

- No SQL migration — the purge is a one-time data cleanup via `DELETE`, not a schema change.
- No change to `computeStatus`/`attentionReason`/the card icon — this design touches only the detail sheet and its two supporting data-layer bugs.
- `stackedOn` collection in the add/role UI is not implemented here; `targetLabel` merely reads it when present.
