import { describe, it, expect } from "vitest";
import { extractErrors } from "@/lib/job-log";

// Real lines from magic-onboarding job 87061580817 (the failing Lint job),
// including the trailing noise that a naive "show the tail" approach would
// have surfaced instead of the actual errors.
const REAL_LOG = [
  "2026-07-14T10:33:26.1000000Z ##[group]Run actions/checkout@v4",
  "2026-07-14T10:33:27.2000000Z [command]/usr/bin/git init",
  "2026-07-14T10:34:38.3855791Z ##[error]internal/shopify/browser/totp.go:59:1: File is not properly formatted (golines)",
  "2026-07-14T10:34:38.3870586Z ##[error]internal/shopify/browser/chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)",
  "2026-07-14T10:34:38.3874817Z ##[error]internal/shopify/browser/cli_auth_error_paths_test.go:107:2: G101: Potential hardcoded credentials (gosec)",
  "2026-07-14T10:34:38.3892817Z ##[error]issues found",
  "2026-07-14T10:34:39.1468558Z Cleaning up orphan processes",
  "2026-07-14T10:34:39.1788295Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20",
].join("\n");

describe("extractErrors", () => {
  it("extracts every ##[error] line with its timestamp stripped", () => {
    const { errors } = extractErrors(REAL_LOG);
    expect(errors).toEqual([
      "internal/shopify/browser/totp.go:59:1: File is not properly formatted (golines)",
      "internal/shopify/browser/chromedp_error_paths_test.go:84:2: G101: Potential hardcoded credentials (gosec)",
      "internal/shopify/browser/cli_auth_error_paths_test.go:107:2: G101: Potential hardcoded credentials (gosec)",
      "issues found",
    ]);
  });

  it("excludes warnings, group markers, and command noise", () => {
    const { errors } = extractErrors(REAL_LOG);
    expect(errors.join("\n")).not.toContain("Node.js 20 is deprecated");
    expect(errors.join("\n")).not.toContain("Cleaning up orphan processes");
    expect(errors.join("\n")).not.toContain("##[group]");
    expect(errors.join("\n")).not.toContain("git init");
  });

  it("reports nothing truncated for a normal log", () => {
    expect(extractErrors(REAL_LOG).truncated).toBe(0);
  });

  it("returns an empty result when a job emits no error markers", () => {
    const log = "2026-07-14T10:33:26.1000000Z ok\n2026-07-14T10:33:27.2000000Z done";
    expect(extractErrors(log)).toEqual({ errors: [], truncated: 0 });
  });

  it("caps at 20 errors and reports how many were dropped", () => {
    const log = Array.from({ length: 25 }, (_, i) => `2026-07-14T10:34:38.0000000Z ##[error]problem ${i}`).join("\n");
    const { errors, truncated } = extractErrors(log);
    expect(errors).toHaveLength(20);
    expect(errors[0]).toBe("problem 0");
    expect(errors[19]).toBe("problem 19");
    expect(truncated).toBe(5);
  });

  // An empty marker rendered a blank row AND made errors.length > 0 true,
  // which suppressed both fallback messages — the panel showed an empty box.
  it("ignores a bare ##[error] marker with nothing after it", () => {
    const log = [
      "2026-07-14T10:34:38.0000000Z ##[error]",
      "2026-07-14T10:34:39.0000000Z ##[error]   ",
      "2026-07-14T10:34:40.0000000Z ##[error]real problem",
    ].join("\n");
    expect(extractErrors(log)).toEqual({ errors: ["real problem"], truncated: 0 });
  });

  it("does not let empty markers consume a slot toward the cap or the truncated count", () => {
    const lines = [
      ...Array.from({ length: 20 }, (_, i) => `2026-07-14T10:34:38.0000000Z ##[error]problem ${i}`),
      ...Array.from({ length: 5 }, () => "2026-07-14T10:34:38.0000000Z ##[error]"),
    ];
    const { errors, truncated } = extractErrors(lines.join("\n"));
    expect(errors).toHaveLength(20);
    expect(errors[19]).toBe("problem 19");
    expect(truncated).toBe(0);
  });

  it("handles an empty log", () => {
    expect(extractErrors("")).toEqual({ errors: [], truncated: 0 });
  });

  it("tolerates CRLF line endings", () => {
    const log = "2026-07-14T10:34:38.0000000Z ##[error]boom\r\n2026-07-14T10:34:39.0000000Z done\r\n";
    expect(extractErrors(log).errors).toEqual(["boom"]);
  });
});
