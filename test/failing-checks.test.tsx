import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FailingChecks } from "@/components/detail/failing-checks";

const JOB_URL = "https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817";
const JOB_URL_2 = "https://github.com/acme/magic-onboarding/actions/runs/29325764261/job/87061573038";
const ARGO_URL = "https://argo.dev.acme.in/workflows/argo-workflows/slit-magic-onboarding-jlhgo?tab=workflow";

describe("FailingChecks", () => {
  it("renders an actionable check as a toggle plus a separate github link", () => {
    render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
    expect(screen.getByRole("button", { name: /Lint/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open Lint on github/i })).toHaveAttribute("href", JOB_URL);
  });

  it("renders a non-actionable check as a plain link with no toggle", () => {
    render(<FailingChecks failed={[{ name: "quality-gate-slit", url: ARGO_URL }]} />);
    expect(screen.getByRole("link", { name: "quality-gate-slit" })).toHaveAttribute("href", ARGO_URL);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("explains on hover why a non-actionable check has no controls", () => {
    render(<FailingChecks failed={[{ name: "quality-gate-slit", url: ARGO_URL }]} />);
    expect(screen.getByRole("link", { name: "quality-gate-slit" })).toHaveAttribute(
      "title",
      "External check — not re-runnable from deck",
    );
  });

  it("renders a check with no url as plain text", () => {
    render(<FailingChecks failed={[{ name: "BVT Workflow", url: null }]} />);
    expect(screen.getByText("BVT Workflow")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("expands only the clicked check", () => {
    render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "Lint", url: JOB_URL_2 },
        ]}
      />,
    );
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Lint/ })[0]);
    expect(screen.getAllByTestId("run-panel")).toHaveLength(1);
  });

  it("collapses when the expanded check is clicked again", () => {
    render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
    const toggle = screen.getByRole("button", { name: /Lint/ });
    fireEvent.click(toggle);
    expect(screen.getByTestId("run-panel")).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.queryByTestId("run-panel")).not.toBeInTheDocument();
  });

  it("exposes the expanded state to assistive tech", () => {
    render(<FailingChecks failed={[{ name: "Lint", url: JOB_URL }]} />);
    const toggle = screen.getByRole("button", { name: /Lint/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps both same-named checks independently expandable with distinct links", () => {
    render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "Lint", url: JOB_URL_2 },
        ]}
      />,
    );
    const links = screen.getAllByRole("link", { name: /open Lint on github/i });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([JOB_URL, JOB_URL_2]);
  });

  it("never nests an anchor inside another anchor", () => {
    const { container } = render(
      <FailingChecks
        failed={[
          { name: "Lint", url: JOB_URL },
          { name: "quality-gate-slit", url: ARGO_URL },
        ]}
      />,
    );
    container.querySelectorAll("a").forEach((a) => expect(a.closest("a")).toBe(a));
  });
});
