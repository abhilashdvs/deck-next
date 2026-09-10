import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PatSettings } from "@/components/settings/pat-settings";

const realFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});
afterEach(() => {
  global.fetch = realFetch;
});

describe("PatSettings", () => {
  it("opens the panel and saves a token to localStorage", () => {
    render(<PatSettings />);
    fireEvent.click(screen.getByLabelText("GitHub settings"));
    fireEvent.change(screen.getByPlaceholderText(/ghp_|github_pat_/), { target: { value: "ghp_abc123" } });
    fireEvent.click(screen.getByText("Save"));
    expect(window.localStorage.getItem("deck.githubPat")).toBe("ghp_abc123");
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });

  it("clears a saved token", () => {
    window.localStorage.setItem("deck.githubPat", "ghp_x");
    render(<PatSettings />);
    fireEvent.click(screen.getByLabelText("GitHub settings"));
    fireEvent.click(screen.getByText("Clear"));
    expect(window.localStorage.getItem("deck.githubPat")).toBeNull();
  });

  it("tests the token against github and reports success", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
    render(<PatSettings />);
    fireEvent.click(screen.getByLabelText("GitHub settings"));
    fireEvent.change(screen.getByPlaceholderText(/ghp_|github_pat_/), { target: { value: "ghp_ok" } });
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(screen.getByText("Token works")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith("https://api.github.com/user", {
      headers: { Authorization: "Bearer ghp_ok" },
    });
  });

  it("reports an invalid token", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch;
    render(<PatSettings />);
    fireEvent.click(screen.getByLabelText("GitHub settings"));
    fireEvent.change(screen.getByPlaceholderText(/ghp_|github_pat_/), { target: { value: "ghp_bad" } });
    fireEvent.click(screen.getByText("Test"));
    await waitFor(() => expect(screen.getByText("Invalid token")).toBeInTheDocument());
  });
});
