import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// The routes resolve a GitHubClient via resolveClient; tests substitute a fake
// client and assert the paths/argv it receives, so the assertions are about the
// route's logic, not the transport. (The real gh transport shells the same
// paths; the PAT transport fetches them over HTTP.)
const mockRest = vi.fn();
const mockRestText = vi.fn();
const mockRestPost = vi.fn();
vi.mock("@/lib/github-client", () => ({
  resolveClient: () => ({
    kind: "pat",
    rest: mockRest,
    restText: mockRestText,
    restPost: mockRestPost,
    graphql: vi.fn(),
    prView: vi.fn(),
    searchMyPrs: vi.fn(),
  }),
}));
import { GET as runGET } from "@/app/api/actions/run/route";
import { GET as errorsGET } from "@/app/api/actions/errors/route";
import { POST as rerunPOST } from "@/app/api/actions/rerun/route";

beforeEach(() => {
  vi.clearAllMocks();
});

const post = (body: unknown) =>
  new NextRequest("http://localhost/api/actions/rerun", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("GET /api/actions/run", () => {
  it("returns shaped run detail from two rest calls", async () => {
    mockRest
      .mockResolvedValueOnce({ name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 })
      .mockResolvedValueOnce({
        jobs: [
          { id: 87061580817, name: "Lint", status: "completed", conclusion: "failure", steps: [{ name: "golangci-lint", conclusion: "failure" }] },
        ],
      });
    const res = await runGET(
      new NextRequest("http://localhost/api/actions/run?owner=acme&repo=magic-onboarding&runId=29325766675"),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "CI",
      conclusion: "failure",
      attempt: 1,
      jobs: [{ id: 87061580817, name: "Lint", failedStep: "golangci-lint" }],
    });
    expect(mockRest).toHaveBeenNthCalledWith(1, "repos/acme/magic-onboarding/actions/runs/29325766675");
    expect(mockRest).toHaveBeenNthCalledWith(2, "repos/acme/magic-onboarding/actions/runs/29325766675/jobs?per_page=100");
  });

  // The endpoint pages at 30. A matrix run bigger than that would drop jobs —
  // and the clicked one vanishing takes the whole re-run-job button with it.
  it("asks for a full page of jobs so a big matrix run is not truncated", async () => {
    mockRest
      .mockResolvedValueOnce({ name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 })
      .mockResolvedValueOnce({ jobs: [] });
    await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=1"));
    const path = mockRest.mock.calls[1][0] as string;
    expect(path).toContain("per_page=100");
  });

  it("rejects a path-traversing repo without calling github", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=../../orgs/x&runId=1"));
    expect(res.status).toBe(400);
    expect(mockRest).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric runId without calling github", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=abc"));
    expect(res.status).toBe(400);
    expect(mockRest).not.toHaveBeenCalled();
  });

  it("returns 502 when github fails", async () => {
    mockRest.mockRejectedValueOnce(new Error("gh: Not Found"));
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=1"));
    expect(res.status).toBe(502);
  });
});

describe("GET /api/actions/errors", () => {
  it("extracts error lines from the fetched log with a large maxBuffer", async () => {
    mockRestText.mockResolvedValueOnce("2026-07-14T10:34:38.3855791Z ##[error]totp.go:59:1: File is not properly formatted (golines)");
    const res = await errorsGET(
      new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=magic-onboarding&jobId=87061580817"),
    );
    expect(await res.json()).toEqual({
      errors: ["totp.go:59:1: File is not properly formatted (golines)"],
      truncated: 0,
    });
    expect(mockRestText).toHaveBeenCalledWith(
      "repos/acme/magic-onboarding/actions/jobs/87061580817/logs",
      { maxBuffer: 20 * 1024 * 1024 },
    );
  });

  it("rejects a bad jobId without calling github", async () => {
    const res = await errorsGET(new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=api&jobId=x"));
    expect(res.status).toBe(400);
    expect(mockRestText).not.toHaveBeenCalled();
  });
});

// These assert the path that WOULD be sent. No test fires a real re-run.
describe("POST /api/actions/rerun", () => {
  it("builds the single-job rerun path", async () => {
    mockRestPost.mockResolvedValueOnce(undefined);
    const res = await rerunPOST(post({ owner: "acme", repo: "magic-onboarding", scope: "job", jobId: "87061580817" }));
    expect(res.status).toBe(200);
    expect(mockRestPost).toHaveBeenCalledWith("repos/acme/magic-onboarding/actions/jobs/87061580817/rerun");
  });

  it("builds the rerun-failed-jobs path", async () => {
    mockRestPost.mockResolvedValueOnce(undefined);
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-failed", runId: "29553312321" }));
    expect(mockRestPost).toHaveBeenCalledWith("repos/acme/api/actions/runs/29553312321/rerun-failed-jobs");
  });

  it("builds the rerun-all path", async () => {
    mockRestPost.mockResolvedValueOnce(undefined);
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "29553312321" }));
    expect(mockRestPost).toHaveBeenCalledWith("repos/acme/api/actions/runs/29553312321/rerun");
  });

  it("rejects an unknown scope without calling github", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "nuke", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockRestPost).not.toHaveBeenCalled();
  });

  it("rejects a path-traversing owner without calling github", async () => {
    const res = await rerunPOST(post({ owner: "../../x", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockRestPost).not.toHaveBeenCalled();
  });

  it("rejects a job-scope body that omits jobId without calling github", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "job" }));
    expect(res.status).toBe(400);
    expect(mockRestPost).not.toHaveBeenCalled();
  });

  it("returns 502 when github rejects the rerun", async () => {
    mockRestPost.mockRejectedValueOnce(new Error("gh: HTTP 403"));
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(502);
  });

  it("returns 400 for a malformed body without calling github", async () => {
    const res = await rerunPOST(
      new NextRequest("http://localhost/api/actions/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockRestPost).not.toHaveBeenCalled();
  });

  it("returns 400 for a null body without calling github", async () => {
    const res = await rerunPOST(post(null));
    expect(res.status).toBe(400);
    expect(mockRestPost).not.toHaveBeenCalled();
  });
});
