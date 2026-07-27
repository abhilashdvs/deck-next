import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "@/components/board/card";
import type { ItemDetail, LinkedSource } from "@/lib/types";

const item = (o: Partial<ItemDetail> = {}): ItemDetail => ({
  id: 1,
  title: "CX checkout availability",
  type: "oncall",
  status: "todo",
  statusLocked: 0,
  priority: "p0",
  nextAction: "RCA",
  notes: null,
  blockedReason: null,
  tags: [],
  position: 0,
  snoozedUntil: null,
  createdAt: "",
  updatedAt: "",
  sources: [],
  checklist: [],
  ...o,
});

const src = (o: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 1,
  itemId: 1,
  kind: "github_pr",
  externalId: null,
  repo: "api",
  number: 1,
  url: null,
  title: null,
  state: "open",
  role: null,
  targetBranch: null,
  stackedOn: null,
  mergeOrder: null,
  mergeable: null,
  commentsCount: null,
  unresolvedThreads: null,
  meta: null,
  lastSyncedAt: null,
  ...o,
});

describe("Card", () => {
  it("renders type, priority and title", () => {
    render(<Card item={item()} onOpen={() => {}} />);
    expect(screen.getByText("CX checkout availability")).toBeInTheDocument();
    expect(screen.getByText("P0")).toBeInTheDocument();
    expect(screen.getByText("oncall")).toBeInTheDocument();
  });

  it("renders a multi-PR progress track", () => {
    render(<Card item={item({ sources: [src({ id: 1, state: "open" }), src({ id: 2, state: "merged" })] })} onOpen={() => {}} />);
    expect(screen.getByText(/1 \/ 2 PRs merged/)).toBeInTheDocument();
  });

  it("renders a single-PR track with singular labels", () => {
    render(<Card item={item({ priority: null, sources: [src({ id: 1, state: "open" })] })} onOpen={() => {}} />);
    expect(screen.getByText(/0 \/ 1 PR merged · 1 repo/)).toBeInTheDocument();
  });

  it("shows a conflict indicator", () => {
    render(<Card item={item({ sources: [src({ mergeable: "conflicting" })] })} onOpen={() => {}} />);
    expect(screen.getByLabelText("has conflicts")).toBeInTheDocument();
  });

  it("shows an unresolved-comments indicator", () => {
    render(<Card item={item({ sources: [src({ unresolvedThreads: 2 })] })} onOpen={() => {}} />);
    expect(screen.getByLabelText("2 unresolved")).toBeInTheDocument();
  });
});

describe("Card required checks", () => {
  it("shows a failing-checks icon when a PR has failing required checks", () => {
    render(
      <Card
        item={item({
          sources: [
            src({
              state: "open",
              meta: { checks: { required: 9, passing: 5, failing: 4, pending: 0, failed: [] } },
            }),
          ],
        })}
        onOpen={() => {}}
      />,
    );
    expect(screen.getByLabelText("4 required checks failing")).toBeInTheDocument();
  });

  it("shows no failing-checks icon when checks pass", () => {
    render(
      <Card
        item={item({
          sources: [
            src({
              state: "open",
              meta: { checks: { required: 3, passing: 3, failing: 0, pending: 0, failed: [] } },
            }),
          ],
        })}
        onOpen={() => {}}
      />,
    );
    expect(screen.queryByLabelText(/required checks failing/)).not.toBeInTheDocument();
  });
});
