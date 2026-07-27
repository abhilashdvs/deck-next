import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/gh", () => ({ gh: vi.fn(), ghJson: vi.fn() }));
import { gh, ghJson } from "@/lib/gh";
import { GET as runGET } from "@/app/api/actions/run/route";
import { GET as errorsGET } from "@/app/api/actions/errors/route";
import { POST as rerunPOST } from "@/app/api/actions/rerun/route";

const mockGh = vi.mocked(gh);
const mockGhJson = vi.mocked(ghJson);

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
  it("returns shaped run detail from two gh calls", async () => {
    mockGhJson
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
    expect(mockGhJson).toHaveBeenNthCalledWith(1, ["api", "repos/acme/magic-onboarding/actions/runs/29325766675"]);
    expect(mockGhJson).toHaveBeenNthCalledWith(2, [
      "api",
      "repos/acme/magic-onboarding/actions/runs/29325766675/jobs?per_page=100",
    ]);
  });

  // The endpoint pages at 30. A matrix run bigger than that would drop jobs —
  // and the clicked one vanishing takes the whole re-run-job button with it.
  it("asks for a full page of jobs so a big matrix run is not truncated", async () => {
    mockGhJson
      .mockResolvedValueOnce({ name: "CI", status: "completed", conclusion: "failure", run_attempt: 1 })
      .mockResolvedValueOnce({ jobs: [] });
    await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=1"));
    const argv = mockGhJson.mock.calls[1][0] as string[];
    expect(argv[1]).toContain("per_page=100");
    // --paginate would concatenate JSON documents and blow up ghJson's parse.
    expect(argv).not.toContain("--paginate");
  });

  it("rejects a path-traversing repo without calling gh", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=../../orgs/x&runId=1"));
    expect(res.status).toBe(400);
    expect(mockGhJson).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric runId without calling gh", async () => {
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=abc"));
    expect(res.status).toBe(400);
    expect(mockGhJson).not.toHaveBeenCalled();
  });

  it("returns 502 when gh fails", async () => {
    mockGhJson.mockRejectedValueOnce(new Error("gh: Not Found"));
    const res = await runGET(new NextRequest("http://localhost/api/actions/run?owner=acme&repo=api&runId=1"));
    expect(res.status).toBe(502);
  });
});

describe("GET /api/actions/errors", () => {
  it("extracts error lines from the fetched log with a large maxBuffer", async () => {
    mockGh.mockResolvedValueOnce("2026-07-14T10:34:38.3855791Z ##[error]totp.go:59:1: File is not properly formatted (golines)");
    const res = await errorsGET(
      new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=magic-onboarding&jobId=87061580817"),
    );
    expect(await res.json()).toEqual({
      errors: ["totp.go:59:1: File is not properly formatted (golines)"],
      truncated: 0,
    });
    expect(mockGh).toHaveBeenCalledWith(
      ["api", "repos/acme/magic-onboarding/actions/jobs/87061580817/logs"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
  });

  it("rejects a bad jobId without calling gh", async () => {
    const res = await errorsGET(new NextRequest("http://localhost/api/actions/errors?owner=acme&repo=api&jobId=x"));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });
});

// These assert the argv that WOULD be sent. No test fires a real re-run.
describe("POST /api/actions/rerun", () => {
  it("builds the single-job rerun path", async () => {
    mockGh.mockResolvedValueOnce("");
    const res = await rerunPOST(post({ owner: "acme", repo: "magic-onboarding", scope: "job", jobId: "87061580817" }));
    expect(res.status).toBe(200);
    expect(mockGh).toHaveBeenCalledWith([
      "api", "-X", "POST", "repos/acme/magic-onboarding/actions/jobs/87061580817/rerun",
    ]);
  });

  it("builds the rerun-failed-jobs path", async () => {
    mockGh.mockResolvedValueOnce("");
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-failed", runId: "29553312321" }));
    expect(mockGh).toHaveBeenCalledWith([
      "api", "-X", "POST", "repos/acme/api/actions/runs/29553312321/rerun-failed-jobs",
    ]);
  });

  it("builds the rerun-all path", async () => {
    mockGh.mockResolvedValueOnce("");
    await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "29553312321" }));
    expect(mockGh).toHaveBeenCalledWith(["api", "-X", "POST", "repos/acme/api/actions/runs/29553312321/rerun"]);
  });

  it("rejects an unknown scope without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "nuke", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("rejects a path-traversing owner without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "../../x", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("rejects a job-scope body that omits jobId without calling gh", async () => {
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "job" }));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("returns 502 when gh rejects the rerun", async () => {
    mockGh.mockRejectedValueOnce(new Error("gh: HTTP 403"));
    const res = await rerunPOST(post({ owner: "acme", repo: "api", scope: "run-all", runId: "1" }));
    expect(res.status).toBe(502);
  });

  it("returns 400 for a malformed body without calling gh", async () => {
    const res = await rerunPOST(
      new NextRequest("http://localhost/api/actions/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });

  it("returns 400 for a null body without calling gh", async () => {
    const res = await rerunPOST(post(null));
    expect(res.status).toBe(400);
    expect(mockGh).not.toHaveBeenCalled();
  });
});
