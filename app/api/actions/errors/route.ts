import { NextRequest, NextResponse } from "next/server";
import { gh } from "@/lib/gh";
import { extractErrors } from "@/lib/job-log";
import { isSafeName, isSafeId } from "../validate";

// Job logs are unbounded; execFile's 1MB default maxBuffer would error out on a
// verbose job rather than fail diagnosably.
const LOG_MAX_BUFFER = 20 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const owner = sp.get("owner");
  const repo = sp.get("repo");
  const jobId = sp.get("jobId");
  if (!isSafeName(owner) || !isSafeName(repo) || !isSafeId(jobId)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 });
  }
  try {
    const log = await gh(["api", `repos/${owner}/${repo}/actions/jobs/${jobId}/logs`], { maxBuffer: LOG_MAX_BUFFER });
    return NextResponse.json(extractErrors(log));
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
