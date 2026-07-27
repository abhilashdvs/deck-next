import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterBar } from "@/components/filters/filter-bar";

describe("FilterBar", () => {
  it("opens and toggles a type filter", () => {
    const setFilters = vi.fn();
    render(<FilterBar filters={{}} setFilters={setFilters} />);
    fireEvent.click(screen.getByLabelText("Filter"));
    fireEvent.click(screen.getByText("bug"));
    expect(setFilters).toHaveBeenCalledWith({ type: "bug" });
  });

  it("marks an active priority chip", () => {
    const setFilters = vi.fn();
    render(<FilterBar filters={{ priority: "p1" }} setFilters={setFilters} />);
    fireEvent.click(screen.getByLabelText("Filter"));
    fireEvent.click(screen.getByText("P1"));
    expect(setFilters).toHaveBeenCalledWith({ priority: undefined });
  });
});
