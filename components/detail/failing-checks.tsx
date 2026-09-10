"use client";

import { useState } from "react";
import { ChevronRight, ChevronDown, ExternalLink, RotateCw } from "lucide-react";
import { parseActionsUrl } from "@/lib/actions-url";
import { useRun, useJobErrors } from "@/hooks/use-run";
import { authHeaders } from "@/lib/pat";

type Scope = "job" | "run-failed" | "run-all";

// The prompt names the scope that was picked, so the confirm can't be answered
// out of context — "Yes" to a generic question is how the wrong run gets spent.
const SCOPES: { scope: Scope; label: string; prompt: string }[] = [
  { scope: "job", label: "This job", prompt: "Re-run this job?" },
  { scope: "run-failed", label: "Failed jobs", prompt: "Re-run the failed jobs?" },
  { scope: "run-all", label: "Whole run", prompt: "Re-run the whole run?" },
];

const DOT = "size-[5px] shrink-0 rounded-full";
const JOB_DOT: Record<string, string> = {
  failure: "bg-st-blocked",
  success: "bg-st-done",
  skipped: "bg-text-faint",
  cancelled: "bg-text-faint",
};
const CHIP = "rounded border border-hairline px-1.5 py-px text-[10px] text-text-faint transition hover:text-foreground";
const FAINT = "text-[10.5px] text-text-faint";

function RerunControl({
  confirming,
  setConfirming,
  onConfirm,
  busy,
}: {
  confirming: Scope | null;
  setConfirming: (s: Scope | null) => void;
  onConfirm: (s: Scope) => void;
  busy: boolean;
}) {
  const [menu, setMenu] = useState(false);

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground">{SCOPES.find((s) => s.scope === confirming)?.prompt}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onConfirm(confirming)}
          className="rounded border border-st-blocked/45 px-1.5 py-px text-[10px] text-st-blocked transition hover:bg-st-blocked/15 disabled:opacity-50"
        >
          Yes
        </button>
        <button type="button" onClick={() => setConfirming(null)} className={CHIP}>
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu((v) => !v)}
        className={`${CHIP} flex items-center gap-1`}
      >
        <RotateCw className="size-2.5" aria-hidden="true" />
        Re-run
        <ChevronDown className="size-2.5" aria-hidden="true" />
      </button>
      {menu && (
        // Picking a scope deliberately does NOT fire — it opens the confirm.
        // A menu selection chooses a target; it is not consent to spend CI.
        <span
          role="menu"
          onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
          className="absolute top-full right-0 z-20 mt-1 flex w-[126px] flex-col rounded-md border border-border bg-secondary p-1"
        >
          {SCOPES.map((s) => (
            <button
              key={s.scope}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                setConfirming(s.scope);
              }}
              className="rounded px-2 py-1 text-left text-[10.5px] text-muted-foreground transition hover:bg-foreground/[0.06] hover:text-foreground"
            >
              {s.label}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}

function FailingCheck({ check }: { check: { name: string; url: string | null } }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<Scope | null>(null);
  const [busy, setBusy] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);
  const [rerunOk, setRerunOk] = useState<string | null>(null);

  const actionsRef = parseActionsUrl(check.url);
  // A null ref is how SWR is told to skip the request, so a collapsed check —
  // or one that was never actionable — costs nothing on the wire. The hooks
  // still have to run on every render, hence before the early return below.
  const liveRef = open ? actionsRef : null;
  const { run, isLoading, refresh } = useRun(liveRef);
  const { errors, truncated, failed, isLoading: errorsLoading } = useJobErrors(liveRef);

  async function fire(scope: Scope) {
    if (!actionsRef) return;
    setBusy(true);
    setRerunError(null);
    setRerunOk(null);
    const body =
      scope === "job"
        ? { owner: actionsRef.owner, repo: actionsRef.repo, scope, jobId: actionsRef.jobId }
        : { owner: actionsRef.owner, repo: actionsRef.repo, scope, runId: actionsRef.runId };
    let fired = false;
    try {
      const r = await fetch("/api/actions/rerun", {
        method: "POST",
        headers: { "content-type": "application/json", ...authHeaders() },
        body: JSON.stringify(body),
      });
      // A rejected re-run (no write access, run too old) is silent otherwise:
      // the confirm dismisses and the panel refreshes exactly as on success.
      if (r.ok) {
        fired = true;
        // GitHub returns 201 and flips the run asynchronously, so the refresh
        // below usually still reads the old failure. Without this line an
        // accepted re-run looks exactly like a dead button — and the next
        // click spends a second real run on shared CI.
        setRerunOk("Re-run queued — status here catches up shortly");
      } else setRerunError("Re-run didn't fire — start it on GitHub");
    } catch {
      setRerunError("Re-run didn't fire — start it on GitHub");
    } finally {
      setBusy(false);
      setConfirming(null);
    }
    // Outside the try: GitHub already accepted this one, so a throw from
    // refresh() must not be reported as a re-run that never fired. Refetch just
    // this run — a full sync would re-hit every PR for one button press.
    if (fired) refresh();
  }

  // Not a GitHub Actions job (Argo, Spinnaker, a bare repo link, a third-party
  // CheckRun): nothing can be re-run or fetched. The absence of a chevron is
  // the signal; a title explains it on hover rather than labelling every row.
  if (!actionsRef) {
    return (
      <div className="flex items-center gap-2 py-[3px]">
        <span className={`${DOT} bg-st-blocked`} aria-hidden="true" />
        {check.url ? (
          <a
            href={check.url}
            target="_blank"
            rel="noreferrer"
            title="External check — not re-runnable from deck"
            className="min-w-0 truncate font-mono text-[11px] text-muted-foreground transition hover:text-foreground hover:underline"
          >
            {check.name}
          </a>
        ) : (
          <span title={check.name} className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {check.name}
          </span>
        )}
      </div>
    );
  }

  const job = run?.jobs.find((j) => String(j.id) === actionsRef.jobId);
  // GitHub often names the step after the check itself; showing both is noise.
  // Exact match only — a near-miss (a typo in the workflow) is a real difference.
  const step = job?.failedStep && job.failedStep !== check.name ? job.failedStep : null;
  const alsoFailed = (run?.jobs ?? []).filter((j) => j.conclusion === "failure" && String(j.id) !== actionsRef.jobId);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 py-[3px]">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ChevronRight className="size-3 shrink-0 text-text-faint" aria-hidden="true" />
          )}
          <span className={`${DOT} bg-st-blocked`} aria-hidden="true" />
          <span className="truncate font-mono text-[11px] text-foreground" title={check.name}>
            {check.name}
          </span>
        </button>
        {open && (
          <RerunControl confirming={confirming} setConfirming={setConfirming} onConfirm={fire} busy={busy} />
        )}
        <a
          href={check.url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${check.name} on GitHub`}
          className="shrink-0 text-text-faint transition hover:text-foreground"
        >
          <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>

      {open && (
        <div
          data-testid="run-panel"
          className="mb-1 ml-[5.5px] flex flex-col gap-1.5 border-l border-hairline pl-3.5"
        >
          {/* Always mounted: a live region only announces mutations if it already
              exists in the DOM when the text arrives. One region for both
              outcomes, not two — they are mutually exclusive by construction that
              way, and `empty:hidden` is deliberately absent because display:none
              would drop the node from the a11y tree and there would be nothing to
              announce into. */}
          <span role="status" className={`text-[10.5px] ${rerunError ? "text-st-blocked" : "text-st-done"}`}>
            {rerunError ?? rerunOk}
          </span>

          {isLoading && !run ? (
            <span className={FAINT}>loading pipeline…</span>
          ) : !run ? (
            <span className={FAINT}>couldn&apos;t load this run</span>
          ) : (
            <>
              <div className={`flex flex-wrap items-center gap-x-1.5 ${FAINT}`}>
                <span>{run.name}</span>
                <span aria-hidden="true">·</span>
                <span>attempt {run.attempt}</span>
                {step && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      failed at <span className="font-mono text-muted-foreground">{step}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Branch order is load-bearing. useJobErrors reports errors: [] for
                  three different states — still fetching, fetch died, and log
                  genuinely clean — and only the last of them may say so. Real
                  lines outrank `failed`: SWR keeps cached data when a revalidation
                  errors, and lines we already have are worth more than the news
                  that a refetch failed. */}
              {errorsLoading ? (
                <span className={FAINT}>loading log…</span>
              ) : errors.length > 0 ? (
                <div className="flex flex-col gap-0.5 border-l-2 border-st-blocked/50 bg-st-blocked/10 px-2.5 py-1.5">
                  {errors.map((e, i) => (
                    <span key={i} title={e} className="truncate font-mono text-[10.5px] text-st-blocked">
                      {e}
                    </span>
                  ))}
                  {truncated > 0 && <span className={FAINT}>…and {truncated} more</span>}
                </div>
              ) : failed ? (
                <span className={FAINT}>Couldn&apos;t load this log — open the job on GitHub</span>
              ) : (
                <span className={FAINT}>No error markers in this log — open the job on GitHub</span>
              )}

              {alsoFailed.length > 0 && (
                <div className={`flex flex-wrap items-center gap-x-1.5 ${FAINT}`}>
                  <span>also failed</span>
                  {alsoFailed.map((j, i) => (
                    <span key={j.id} className="font-mono text-muted-foreground">
                      {i > 0 && <span className="mr-1.5 text-text-faint">·</span>}
                      {j.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Every job in the run, as dots rather than names — the pipeline at
                  a glance without the wrapping wall of text. No count: the strip
                  shows what the API returned and never claims a total. */}
              <div className="flex flex-wrap items-center gap-1">
                {run.jobs.map((j) => (
                  <span
                    key={j.id}
                    role="img"
                    aria-label={`${j.name} · ${j.conclusion ?? j.status}`}
                    title={`${j.name} · ${j.conclusion ?? j.status}`}
                    className={`${DOT} ${JOB_DOT[j.conclusion ?? ""] ?? "bg-text-faint"}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function FailingChecks({ failed }: { failed: { name: string; url: string | null }[] }) {
  if (failed.length === 0) return null;
  // relative z-10: must outrank PrRow's stretched-link ::after overlay so these
  // controls stay clickable. Never de-duplicate — two checks can share a name
  // with different urls; keyed by index for that reason.
  return (
    <div className="relative z-10 mt-1.5 flex flex-col">
      {failed.map((f, i) => (
        <FailingCheck key={i} check={f} />
      ))}
    </div>
  );
}
