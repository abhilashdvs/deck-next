// These values are interpolated into a `gh api` path. execFile spawns no shell,
// so there is no shell-injection vector — but an unchecked `repo` such as
// "../../orgs/x" would traverse the API path with a push-scoped token.
const SAFE_NAME = /^[\w.-]+$/;
const SAFE_ID = /^\d+$/;

export function isSafeName(v: string | null): v is string {
  return !!v && SAFE_NAME.test(v);
}

export function isSafeId(v: string | null): v is string {
  return !!v && SAFE_ID.test(v);
}
