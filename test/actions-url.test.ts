import { describe, it, expect } from "vitest";
import { parseActionsUrl } from "@/lib/actions-url";

describe("parseActionsUrl", () => {
  it("parses an Actions job url into owner, repo, runId and jobId", () => {
    expect(
      parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325766675/job/87061580817"),
    ).toEqual({ owner: "acme", repo: "magic-onboarding", runId: "29325766675", jobId: "87061580817" });
  });

  it("parses the second Lint job (same name, different run) distinctly", () => {
    expect(
      parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325764261/job/87061573038"),
    ).toEqual({ owner: "acme", repo: "magic-onboarding", runId: "29325764261", jobId: "87061573038" });
  });

  it("rejects a run url with no job segment (quality-gate-ut is a StatusContext)", () => {
    expect(parseActionsUrl("https://github.com/acme/magic-onboarding/actions/runs/29325766682")).toBeNull();
  });

  it("rejects an Argo url (quality-gate-slit)", () => {
    expect(
      parseActionsUrl("https://argo.dev.acme.in/workflows/argo-workflows/slit-magic-onboarding-jlhgo?tab=workflow"),
    ).toBeNull();
  });

  it("rejects a Spinnaker url (BVT Workflow)", () => {
    expect(
      parseActionsUrl("https://deploy.acme.com//#/applications/bvt-api/executions/details/01KXQ7S8GGZAWEYQXD0WFE795X"),
    ).toBeNull();
  });

  it("rejects a bare repo url (github/combined-status-check)", () => {
    expect(parseActionsUrl("https://github.com/acme/terminals")).toBeNull();
  });

  it("rejects a third-party CheckRun url (semgrep) — a CheckRun GitHub still cannot re-run", () => {
    expect(parseActionsUrl("https://semgrep.dev/orgs/acme/projects/5086932/scans/192798035")).toBeNull();
  });

  it("rejects null and empty input", () => {
    expect(parseActionsUrl(null)).toBeNull();
    expect(parseActionsUrl("")).toBeNull();
  });

  it("rejects a non-https or foreign host that merely contains the path shape", () => {
    expect(parseActionsUrl("https://evil.example.com/acme/api/actions/runs/1/job/2")).toBeNull();
  });
});
