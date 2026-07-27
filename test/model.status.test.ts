import { describe, it, expect } from "vitest";
import { computeStatus } from "@/lib/model/status";
import type { WorkItem, LinkedSource, PrChecks } from "@/lib/types";

const item = (o: Partial<WorkItem> = {}): WorkItem =>
  ({ id: 1, title: "t", type: "task", status: "todo", statusLocked: 0, ...o }) as WorkItem;

const pr = (o: Partial<LinkedSource> = {}): LinkedSource =>
  ({ id: 1, itemId: 1, kind: "github_pr", state: "open", meta: null, ...o }) as LinkedSource;

const checks = (o: Partial<PrChecks> = {}): PrChecks => ({
  required: 3,
  passing: 3,
  failing: 0,
  pending: 0,
  failed: [],
  ...o,
});

describe("computeStatus with required checks", () => {
  it("keeps a multi-PR item out of in_review when a required check is failing", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks({ failing: 2, passing: 1 }) } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_progress");
  });

  it("allows in_review when required checks are passing", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks() } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_review");
  });

  it("allows in_review when required checks are only pending", () => {
    const sources = [
      pr({ id: 1, meta: { checks: checks({ passing: 1, pending: 2 }) } }),
      pr({ id: 2, meta: { checks: checks() } }),
    ];
    expect(computeStatus(item(), sources, [])).toBe("in_review");
  });

  it("allows in_review when a PR has no check data at all", () => {
    expect(computeStatus(item(), [pr({ id: 1 }), pr({ id: 2 })], [])).toBe("in_review");
  });
});
