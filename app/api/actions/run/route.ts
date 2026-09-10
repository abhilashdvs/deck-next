import { NextRequest, NextResponse } from "next/server";
import { toRunDetail, type GhRun, type GhJob } from "@/lib/actions";
import { isSafeName, isSafeId } from "../validate";
import { resolveClient } from "@/lib/github-client";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const owner = sp.get("owner");
  const repo = sp.get("repo");
  const runId = sp.get("runId");
  if (!isSafeName(owner) || !isSafeName(repo) || !isSafeId(runId)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
  const client = resolveClient(token);
  const base = `repos/${owner}/${repo}/actions/runs/${runId}`;
  try {
    const run = await client.rest<GhRun>(base);
    // per_page=100: this endpoint pages at 30 by default, and a matrix run past
    // that silently loses jobs — including, sometimes, the one the user clicked,
    // which would take the "failed at <step>" row and the re-run-job button with
    // it. Not `--paginate`: gh concatenates JSON documents and ghJson's single
    // JSON.parse would throw on the second one. The PAT transport hits the same
    // endpoint directly and paginates identically.
    const { jobs } = await client.rest<{ jobs: GhJob[] }>(`${base}/jobs?per_page=100`);
    return NextResponse.json(toRunDetail(run, jobs));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
