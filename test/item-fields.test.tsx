import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ItemFields } from "@/components/detail/item-fields";
import type { ItemDetail } from "@/lib/types";

const item = (o: Partial<ItemDetail> = {}): ItemDetail => ({
  id: 1,
  title: "t",
  type: "task",
  status: "todo",
  statusLocked: 0,
  priority: null,
  nextAction: null,
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

describe("ItemFields empty-state collapse", () => {
  it("shows one collapsed row when next action, tags, and notes are all empty", () => {
    render(<ItemFields item={item()} onPatch={vi.fn()} />);
    expect(screen.getByText("+ next action")).toBeInTheDocument();
    expect(screen.getByText("tag")).toBeInTheDocument();
    expect(screen.getByText("note")).toBeInTheDocument();
    expect(screen.queryByText("Add a next action…")).not.toBeInTheDocument();
  });

  it("reveals all three normal fields when a collapsed segment is clicked", () => {
    render(<ItemFields item={item()} onPatch={vi.fn()} />);
    fireEvent.click(screen.getByText("+ next action"));
    expect(screen.getByText("Add a next action…")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("add tag…")).toBeInTheDocument();
    expect(screen.getByText("Add notes…")).toBeInTheDocument();
    expect(screen.queryByText("+ next action")).not.toBeInTheDocument();
  });

  it("renders all three fields normally, uncollapsed, when nextAction already has content", () => {
    render(<ItemFields item={item({ nextAction: "Ship it" })} onPatch={vi.fn()} />);
    expect(screen.getByText("Ship it")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("add tag…")).toBeInTheDocument();
    expect(screen.queryByText("+ next action")).not.toBeInTheDocument();
  });

  it("renders all three fields normally, uncollapsed, when tags already has content", () => {
    render(<ItemFields item={item({ tags: ["urgent"] })} onPatch={vi.fn()} />);
    expect(screen.getByText("urgent")).toBeInTheDocument();
    expect(screen.getByText("Add a next action…")).toBeInTheDocument();
  });

  it("shows the blocked-reason prompt when blocked, even while the other three fields are collapsed", () => {
    render(<ItemFields item={item({ status: "blocked" })} onPatch={vi.fn()} />);
    expect(screen.getByText("Why is this blocked?")).toBeInTheDocument();
    expect(screen.getByText("+ next action")).toBeInTheDocument();
  });

  it("does not show the blocked-reason prompt when not blocked", () => {
    render(<ItemFields item={item({ status: "todo" })} onPatch={vi.fn()} />);
    expect(screen.queryByText("Why is this blocked?")).not.toBeInTheDocument();
  });
});
