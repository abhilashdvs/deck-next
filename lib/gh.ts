import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

// Thin seam over the gh CLI so route handlers stay unit-testable: tests mock
// this module rather than node:child_process (promisify's custom symbol makes
// mocking child_process directly change the resolved shape).
export async function gh(args: string[], opts: { maxBuffer?: number } = {}): Promise<string> {
  const { stdout } = await execFileP("gh", args, { maxBuffer: opts.maxBuffer ?? 1024 * 1024 });
  return stdout;
}

export async function ghJson<T>(args: string[]): Promise<T> {
  return JSON.parse(await gh(args)) as T;
}
