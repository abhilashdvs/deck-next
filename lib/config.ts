// GitHub org used to build PR URLs from `repo#123` shorthand. Full PR URLs
// always work; the shorthand needs this to know which org to point at.
export function defaultGithubOrg(): string {
  return process.env.NEXT_PUBLIC_GITHUB_ORG ?? "";
}
