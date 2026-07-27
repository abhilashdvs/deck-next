export interface ActionsRef {
  owner: string;
  repo: string;
  runId: string;
  jobId: string;
}

// A failing check is re-runnable only if it is a real GitHub Actions job, and
// that is exactly what this URL shape proves. Returning null IS the
// "not actionable" signal — external StatusContexts (Argo, Spinnaker), bare
// repo links, and third-party CheckRuns (semgrep) all correctly fail to match,
// as does an Actions *run* url with no /job/ segment.
const ACTIONS_JOB_URL = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/actions\/runs\/(\d+)\/job\/(\d+)/;

export function parseActionsUrl(url: string | null): ActionsRef | null {
  if (!url) return null;
  const m = ACTIONS_JOB_URL.exec(url);
  return m ? { owner: m[1], repo: m[2], runId: m[3], jobId: m[4] } : null;
}
