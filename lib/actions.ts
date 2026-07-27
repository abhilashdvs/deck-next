export interface GhRun {
  name: string;
  status: string;
  conclusion: string | null;
  run_attempt: number;
}

export interface GhJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  steps?: { name: string; conclusion: string | null }[];
}

export interface RunJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  failedStep: string | null;
}

export interface RunDetail {
  name: string;
  status: string;
  conclusion: string | null;
  attempt: number;
  jobs: RunJob[];
}

// Every job is kept, not just failing ones — seeing that Test passed while Lint
// failed is the point of a pipeline view. `failedStep` is what usually answers
// "what broke" without fetching the log at all.
export function toRunDetail(run: GhRun, jobs: GhJob[]): RunDetail {
  return {
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    attempt: run.run_attempt,
    jobs: jobs.map((j) => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      failedStep: j.steps?.find((s) => s.conclusion === "failure")?.name ?? null,
    })),
  };
}
