import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PrRow } from "@/components/detail/pr-row";
import type { LinkedSource } from "@/lib/types";

const src = (o: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 1,
  itemId: 1,
  kind: "github_pr",
  externalId: "api#66682",
  repo: "api",
  number: 66682,
  url: null,
  title: "Dual-write, read-shift",
  state: "open",
  role: "base",
  targetBranch: "master",
  stackedOn: null,
  mergeOrder: 7,
  mergeable: null,
  commentsCount: null,
  unresolvedThreads: null,
  meta: null,
  lastSyncedAt: null,
  ...o,
});

describe("PrRow structure", () => {
  it("shows repo #number and target", () => {
    render(<PrRow src={src()} />);
    expect(screen.getByText("api #66682")).toBeInTheDocument();
    expect(screen.getByText("→ master")).toBeInTheDocument();
  });

  it("renders the id as a link to the PR when a url is resolvable", () => {
    render(<PrRow src={src({ url: "https://github.com/acme/api/pull/66682" })} />);
    expect(screen.getByRole("link", { name: "api #66682" })).toHaveAttribute(
      "href",
      "https://github.com/acme/api/pull/66682",
    );
  });

  it("renders the id as plain text when no url is resolvable", () => {
    render(<PrRow src={src({ url: null, kind: "url" as LinkedSource["kind"], repo: null, number: null })} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("never nests an anchor inside another anchor (stretched-link regression guard)", () => {
    const { container } = render(
      <PrRow
        src={src({
          meta: {
            checks: {
              required: 2,
              passing: 0,
              failing: 2,
              pending: 0,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "Lint", url: "https://ci/b" },
              ],
            },
          },
        })}
      />,
    );
    const anchors = container.querySelectorAll("a");
    expect(anchors.length).toBeGreaterThan(1);
    anchors.forEach((a) => expect(a.closest("a")).toBe(a));
  });
});

describe("PrRow meta line", () => {
  it("shows an open fallback when there is no other signal", () => {
    render(<PrRow src={src()} />);
    expect(screen.getByText("open")).toBeInTheDocument();
  });

  it("shows draft instead of open for a draft PR", () => {
    render(<PrRow src={src({ state: "draft" })} />);
    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows merged for a merged PR", () => {
    render(<PrRow src={src({ state: "merged" })} />);
    expect(screen.getByText("merged")).toBeInTheDocument();
  });

  it("shows conflicts when mergeable is conflicting", () => {
    render(<PrRow src={src({ mergeable: "conflicting" })} />);
    expect(screen.getByText("conflicts")).toBeInTheDocument();
  });

  it("shows N unresolved", () => {
    render(<PrRow src={src({ unresolvedThreads: 3 })} />);
    expect(screen.getByText("3 unresolved")).toBeInTheDocument();
  });

  it("shows approved for an approved review, without the old checkmark-prefixed text", () => {
    render(<PrRow src={src({ meta: { review: "approved" } })} />);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.queryByText("✓ approved")).not.toBeInTheDocument();
  });

  it("shows changes requested for a changes-requested review", () => {
    render(<PrRow src={src({ meta: { review: "changes_requested" } })} />);
    expect(screen.getByText("changes requested")).toBeInTheDocument();
  });

  it("shows review for a review-required review", () => {
    render(<PrRow src={src({ meta: { review: "review_required" } })} />);
    expect(screen.getByText("review")).toBeInTheDocument();
  });
});

const checks = (o = {}) => ({ required: 9, passing: 9, failing: 0, pending: 0, failed: [], ...o });

describe("PrRow required checks", () => {
  it("shows a checks-failing summary and links each failing check inside the card", () => {
    const { container } = render(
      <PrRow
        src={src({
          meta: {
            checks: checks({
              passing: 5,
              failing: 2,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "quality-gate-slit", url: "https://ci/b" },
              ],
            }),
          },
        })}
      />,
    );
    expect(screen.getByText("2 checks failing")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "quality-gate-slit" });
    expect(link).toHaveAttribute("href", "https://ci/b");
    // The failing-check link must be a descendant of the same card, not a
    // detached sibling block below it.
    expect(container.firstElementChild?.contains(link)).toBe(true);
  });

  it("renders both entries when two failing checks share a name, each with its own link", () => {
    render(
      <PrRow
        src={src({
          meta: {
            checks: checks({
              passing: 7,
              failing: 2,
              failed: [
                { name: "Lint", url: "https://ci/a" },
                { name: "Lint", url: "https://ci/b" },
              ],
            }),
          },
        })}
      />,
    );
    const links = screen.getAllByRole("link", { name: "Lint" });
    expect(links).toHaveLength(2);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["https://ci/a", "https://ci/b"]);
  });

  it("shows a checks-pending summary when nothing is failing yet", () => {
    render(<PrRow src={src({ meta: { checks: checks({ passing: 1, pending: 2 }) } })} />);
    expect(screen.getByText("2 checks pending")).toBeInTheDocument();
  });

  it("shows checks passing with no denominator", () => {
    render(<PrRow src={src({ meta: { checks: checks() } })} />);
    expect(screen.getByText("checks passing")).toBeInTheDocument();
    expect(screen.queryByText(/9\/9/)).not.toBeInTheDocument();
  });

  it("shows nothing checks-related when no required checks reported", () => {
    render(<PrRow src={src({ meta: { checks: checks({ required: 0, passing: 0 }) } })} />);
    expect(screen.queryByText(/checks (failing|pending|passing)/)).not.toBeInTheDocument();
  });

  it("suppresses checks entirely on a merged PR", () => {
    render(
      <PrRow
        src={src({
          state: "merged",
          meta: { checks: checks({ failing: 3, failed: [{ name: "Lint", url: "https://ci/a" }] }) },
        })}
      />,
    );
    expect(screen.queryByText(/checks failing/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Lint" })).not.toBeInTheDocument();
  });

  it("renders a failing check without a url as plain text, titled with its full name", () => {
    render(
      <PrRow src={src({ meta: { checks: checks({ failing: 1, failed: [{ name: "BVT Workflow", url: null }] }) } })} />,
    );
    const el = screen.getByText("BVT Workflow");
    expect(el.tagName).toBe("SPAN");
    expect(el).toHaveAttribute("title", "BVT Workflow");
    expect(screen.queryByRole("link", { name: "BVT Workflow" })).not.toBeInTheDocument();
  });
});

describe("PrRow target abbreviation", () => {
  it("abbreviates a same-repo stacked target to just the PR number", () => {
    render(<PrRow src={src({ repo: "api", stackedOn: "api#66682", targetBranch: "api#66682" })} />);
    expect(screen.getByText("→ #66682")).toBeInTheDocument();
    expect(screen.queryByText("→ api#66682")).not.toBeInTheDocument();
  });

  it("shows the full label for a cross-repo stacked target", () => {
    render(<PrRow src={src({ repo: "terminals", stackedOn: "api#66682", targetBranch: "api#66682" })} />);
    expect(screen.getByText("→ api#66682")).toBeInTheDocument();
  });

  it("falls back to targetBranch when stackedOn is unset", () => {
    render(<PrRow src={src({ stackedOn: null, targetBranch: "master" })} />);
    expect(screen.getByText("→ master")).toBeInTheDocument();
  });
});
