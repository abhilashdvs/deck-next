import { NextRequest, NextResponse } from "next/server";
import { gh } from "@/lib/gh";
import { isSafeName, isSafeId } from "../validate";

type Body = {
  owner?: string;
  repo?: string;
  scope?: string;
  runId?: string;
  jobId?: string;
};

// Maps 1:1 onto GitHub's own three re-run buttons. Run-scoped by design: a PR's
// failures span multiple runs, and a PR-wide fan-out was deliberately deferred.
function rerunPath(b: Body): string | null {
  const base = `repos/${b.owner}/${b.repo}/actions`;
  if (b.scope === "job") return isSafeId(b.jobId ?? null) ? `${base}/jobs/${b.jobId}/rerun` : null;
  if (b.scope === "run-failed") return isSafeId(b.runId ?? null) ? `${base}/runs/${b.runId}/rerun-failed-jobs` : null;
  if (b.scope === "run-all") return isSafeId(b.runId ?? null) ? `${base}/runs/${b.runId}/rerun` : null;
  return null;
}

export async function POST(req: NextRequest) {
  // A malformed/empty body must be a legible 400, not a 500 stack trace —
  // this is the one route that spends real CI.
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || !isSafeName(b.owner ?? null) || !isSafeName(b.repo ?? null)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const path = rerunPath(b);
  if (!path) return NextResponse.json({ error: "invalid scope" }, { status: 400 });
  try {
    await gh(["api", "-X", "POST", path]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
