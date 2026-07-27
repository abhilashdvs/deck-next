import { describe, it, expect } from "vitest";
import { toRunDetail, type GhRun, type GhJob } from "@/lib/actions";

// Shape captured from the real run 29325766675 (workflow "CI").
const RUN: GhRun = { name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 };

const JOBS: GhJob[] = [
  {
    id: 87061580817,
    name: "Lint",
    status: "completed",
    conclusion: "failure",
    steps: [
      { name: "Set up job", conclusion: "success" },
      { name: "Checkout code", conclusion: "success" },
      { name: "golangci-lint", conclusion: "failure" },
      { name: "Post golangci-lint", conclusion: "success" },
    ],
  },
  { id: 2, name: "Test", status: "completed", conclusion: "success", steps: [{ name: "go test", conclusion: "success" }] },
  { id: 3, name: "Build", status: "completed", conclusion: "skipped" },
];

describe("toRunDetail", () => {
  it("maps run meta including the attempt number", () => {
    const d = toRunDetail(RUN, JOBS);
    expect(d).toMatchObject({ name: "CI", status: "completed", conclusion: "failure", attempt: 1 });
  });

  it("keeps every job, not just failing ones", () => {
    expect(toRunDetail(RUN, JOBS).jobs.map((j) => j.name)).toEqual(["Lint", "Test", "Build"]);
  });

  it("pinpoints the failing step of a failed job", () => {
    const lint = toRunDetail(RUN, JOBS).jobs.find((j) => j.id === 87061580817)!;
    expect(lint.failedStep).toBe("golangci-lint");
  });

  it("reports no failing step for a passing job", () => {
    expect(toRunDetail(RUN, JOBS).jobs.find((j) => j.name === "Test")!.failedStep).toBeNull();
  });

  it("tolerates a job with no steps array (skipped jobs omit it)", () => {
    expect(toRunDetail(RUN, JOBS).jobs.find((j) => j.name === "Build")!.failedStep).toBeNull();
  });

  it("preserves job ids so a caller can match the exact job from its url", () => {
    expect(toRunDetail(RUN, JOBS).jobs.map((j) => j.id)).toEqual([87061580817, 2, 3]);
  });
});
