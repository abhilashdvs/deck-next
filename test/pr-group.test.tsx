import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PrGroup } from "@/components/detail/pr-group";
import type { LinkedSource } from "@/lib/types";

const src = (o: Partial<LinkedSource> = {}): LinkedSource => ({
  id: 1,
  itemId: 1,
  kind: "github_pr",
  externalId: "api#66682",
  repo: "api",
  number: 66682,
  url: null,
  title: null,
  state: "open",
  role: "base",
  targetBranch: "master",
  stackedOn: null,
  // Deliberately distinct from any group's source count used below, so the
  // merge-order badge text never collides with the header's count-pill text
  // in a getByText query (both can render a bare digit).
  mergeOrder: 9,
  mergeable: null,
  commentsCount: null,
  unresolvedThreads: null,
  meta: null,
  lastSyncedAt: null,
  ...o,
});

describe("PrGroup", () => {
  it("renders the section header with label, target, and count", () => {
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        // targetBranch/stackedOn cleared on the source itself: PrRow renders
        // its own target label from the source, which would otherwise also
        // read "→ master" and collide with the header's own target text in
        // a getByText query. This isolates the assertion to the header.
        sources={[src({ targetBranch: null, stackedOn: null })]}
        onPatchSource={vi.fn()}
        onRemoveSource={vi.fn()}
      />,
    );
    expect(screen.getByText("Base PRs")).toBeInTheDocument();
    expect(screen.getByText("→ master")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("renders one PrRow per source", () => {
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src({ id: 1, number: 1 }), src({ id: 2, number: 2, externalId: "api#2" })]}
        onPatchSource={vi.fn()}
        onRemoveSource={vi.fn()}
      />,
    );
    expect(screen.getByText("api #1")).toBeInTheDocument();
    expect(screen.getByText("api #2")).toBeInTheDocument();
  });

  it("calls onPatchSource with the new role and target when the role select changes", () => {
    const onPatchSource = vi.fn();
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src()]}
        onPatchSource={onPatchSource}
        onRemoveSource={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("PR role"), { target: { value: "stacked" } });
    expect(onPatchSource).toHaveBeenCalledWith(1, { role: "stacked", targetBranch: "base PR branch" });
  });

  it("calls onRemoveSource with the source id when the remove button is clicked", () => {
    const onRemoveSource = vi.fn();
    render(
      <PrGroup
        role="base"
        label="Base PRs"
        target="→ master"
        sources={[src()]}
        onPatchSource={vi.fn()}
        onRemoveSource={onRemoveSource}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove PR"));
    expect(onRemoveSource).toHaveBeenCalledWith(1);
  });
});
