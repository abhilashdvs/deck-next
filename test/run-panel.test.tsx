import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FailingChecks } from "@/components/detail/failing-checks";
import type { RunDetail } from "@/lib/actions";

const refresh = vi.fn();
vi.mock("@/hooks/use-run", () => ({
  useRun: vi.fn(),
  useJobErrors: vi.fn(),
}));
import { useRun, useJobErrors } from "@/hooks/use-run";

const JOB_URL = "https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817";

const RUN: RunDetail = {
  name: "CI",
  status: "completed",
  conclusion: "failure",
  attempt: 1,
  jobs: [
    { id: 87061580817, name: "Lint", status: "completed", conclusion: "failure", failedStep: "golangci-lint" },
    { id: 2, name: "Test", status: "completed", conclusion: "success", failedStep: null },
    { id: 3, name: "Build", status: "completed", conclusion: "skipped", failedStep: null },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useRun).mockReturnValue({ run: RUN, isLoading: false, refresh });
  vi.mocked(useJobErrors).mockReturnValue({
    errors: ["totp.go:59:1: File is not properly formatted (golines)"],
    truncated: 0,
    isLoading: false,
    failed: false,
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch;
});

function expand() {
  render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
  fireEvent.click(screen.getByRole("button", { name: /Lint/ }));
}

// Opening the menu and picking a scope are both inert; only the confirm fires.
function pickScope(label: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: /re-run/i }));
  fireEvent.click(screen.getByRole("menuitem", { name: label }));
}

function confirm() {
  fireEvent.click(screen.getByRole("button", { name: /^yes$/i }));
}

describe("RunPanel pipeline", () => {
  it("shows the run name and attempt", () => {
    expand();
    expect(screen.getByText(/CI/)).toBeInTheDocument();
    expect(screen.getByText(/attempt 1/)).toBeInTheDocument();
  });

  it("shows the failing step of this job", () => {
    expand();
    expect(screen.getByText(/golangci-lint/)).toBeInTheDocument();
  });

  // The step is usually named after the check; printing both is the redundancy
  // the redesign removes. Only an exact match collapses.
  it("hides the step when it exactly repeats the check name", () => {
    vi.mocked(useRun).mockReturnValue({
      run: { ...RUN, jobs: [{ ...RUN.jobs[0], failedStep: "Lint" }] },
      isLoading: false,
      refresh,
    });
    expand();
    expect(screen.queryByText(/failed at/i)).not.toBeInTheDocument();
  });

  it("still shows a step that only nearly repeats the check name", () => {
    vi.mocked(useRun).mockReturnValue({
      run: { ...RUN, jobs: [{ ...RUN.jobs[0], failedStep: "Lnit" }] },
      isLoading: false,
      refresh,
    });
    expand();
    expect(screen.getByText(/Lnit/)).toBeInTheDocument();
  });

  it("represents every job in the run, not just the failing one", () => {
    expand();
    expect(screen.getByLabelText("Test · success")).toBeInTheDocument();
    expect(screen.getByLabelText("Build · skipped")).toBeInTheDocument();
    expect(screen.getByLabelText("Lint · failure")).toBeInTheDocument();
  });

  it("names sibling jobs that also failed", () => {
    vi.mocked(useRun).mockReturnValue({
      run: {
        ...RUN,
        jobs: [...RUN.jobs, { id: 4, name: "E2E", status: "completed", conclusion: "failure", failedStep: null }],
      },
      isLoading: false,
      refresh,
    });
    expand();
    expect(screen.getByText(/also failed/i)).toBeInTheDocument();
    expect(screen.getByText("E2E")).toBeInTheDocument();
  });

  it("omits the also-failed line when this is the only failing job", () => {
    expand();
    expect(screen.queryByText(/also failed/i)).not.toBeInTheDocument();
  });

  it("shows the extracted error lines", () => {
    expand();
    expect(screen.getByText("totp.go:59:1: File is not properly formatted (golines)")).toBeInTheDocument();
  });

  it("says so when a log has no error markers", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: [], truncated: 0, isLoading: false, failed: false });
    expand();
    expect(screen.getByText(/no error markers/i)).toBeInTheDocument();
  });

  it("reports how many errors were truncated", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: ["a"], truncated: 5, isLoading: false, failed: false });
    expand();
    expect(screen.getByText(/5 more/)).toBeInTheDocument();
  });

  it("says the log could not be loaded when the fetch failed", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: [], truncated: 0, isLoading: false, failed: true });
    expand();
    expect(screen.getByText(/couldn't load this log/i)).toBeInTheDocument();
    expect(screen.queryByText(/no error markers/i)).not.toBeInTheDocument();
  });

  it("distinguishes a genuinely empty log from a failed fetch", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: [], truncated: 0, isLoading: false, failed: false });
    expand();
    expect(screen.getByText(/no error markers/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load this log/i)).not.toBeInTheDocument();
  });

  it("keeps showing cached error lines when a revalidation fails", () => {
    vi.mocked(useJobErrors).mockReturnValue({
      errors: ["totp.go:59:1: File is not properly formatted (golines)"],
      truncated: 0,
      isLoading: false,
      failed: true,
    });
    expand();
    expect(screen.getByText("totp.go:59:1: File is not properly formatted (golines)")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load this log/i)).not.toBeInTheDocument();
  });

  it("does not claim the log is clean while it is still loading", () => {
    vi.mocked(useJobErrors).mockReturnValue({ errors: [], truncated: 0, isLoading: true, failed: false });
    expand();
    expect(screen.queryByText(/no error markers/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/couldn't load this log/i)).not.toBeInTheDocument();
    expect(screen.getByText(/loading log/i)).toBeInTheDocument();
  });
});

// No test fires a real re-run: fetch is mocked and only the request is asserted.
describe("RunPanel re-run", () => {
  it("opening the menu fires nothing", () => {
    expand();
    fireEvent.click(screen.getByRole("button", { name: /re-run/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("menuitem", { name: /this job/i })).toBeInTheDocument();
  });

  it("picking a scope fires nothing and asks to confirm that scope", () => {
    expand();
    pickScope(/failed jobs/i);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/re-run the failed jobs\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^yes$/i })).toBeInTheDocument();
  });

  it("posts the job scope after confirming", async () => {
    expand();
    pickScope(/this job/i);
    confirm();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, init] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe("/api/actions/rerun");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "job",
      jobId: "87061580817",
    });
  });

  it("posts the run-failed scope after confirming", async () => {
    expand();
    pickScope(/failed jobs/i);
    confirm();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "run-failed",
      runId: "29325766675",
    });
  });

  it("posts the run-all scope after confirming", async () => {
    expand();
    pickScope(/whole run/i);
    confirm();
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((vi.mocked(global.fetch).mock.calls[0][1] as RequestInit).body))).toEqual({
      owner: "acme",
      repo: "magic-onboarding",
      scope: "run-all",
      runId: "29325766675",
    });
  });

  it("cancelling the confirm fires nothing", () => {
    expand();
    pickScope(/this job/i);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /re-run/i })).toBeInTheDocument();
  });

  it("refreshes only this run after a successful re-run", async () => {
    expand();
    pickScope(/this job/i);
    confirm();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it("says so when the re-run is rejected, instead of looking like it worked", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "denied" }) }) as unknown as typeof fetch;
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/didn't fire/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("says so when the re-run request throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/didn't fire/i)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows no error after a successful re-run", async () => {
    expand();
    pickScope(/this job/i);
    confirm();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/didn't fire/i)).not.toBeInTheDocument();
  });

  // GitHub flips the run asynchronously, so the immediate refresh usually still
  // reads "completed · failure". Without an affirmative message an accepted
  // re-run is byte-identical to a dead button, and the next click spends a
  // second real run.
  it("confirms that an accepted re-run was queued", async () => {
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/re-run queued/i)).toBeInTheDocument();
  });

  it("announces the confirmation through the already-mounted live region", async () => {
    expand();
    // Present before anything fires — a live region mounted alongside its text
    // announces nothing.
    expect(screen.getByRole("status")).toBeInTheDocument();
    pickScope(/this job/i);
    confirm();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/re-run queued/i));
  });

  it("shows the error and not the confirmation when the re-run is rejected", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "denied" }) }) as unknown as typeof fetch;
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/didn't fire/i)).toBeInTheDocument();
    expect(screen.queryByText(/re-run queued/i)).not.toBeInTheDocument();
  });

  it("clears a previous confirmation when a new re-run is fired", async () => {
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/re-run queued/i)).toBeInTheDocument();

    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "denied" }) }) as unknown as typeof fetch;
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/didn't fire/i)).toBeInTheDocument();
    expect(screen.queryByText(/re-run queued/i)).not.toBeInTheDocument();
  });

  it("clears a previous re-run error when a new re-run is fired", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: "denied" }) }) as unknown as typeof fetch;
    expand();
    pickScope(/this job/i);
    confirm();
    expect(await screen.findByText(/didn't fire/i)).toBeInTheDocument();

    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) }) as unknown as typeof fetch;
    pickScope(/this job/i);
    confirm();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/didn't fire/i)).not.toBeInTheDocument();
  });
});
