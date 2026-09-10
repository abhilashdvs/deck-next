"use client";

// The user's GitHub Personal Access Token, kept only in their browser. It's
// sent to the app's own route handlers as an Authorization: Bearer header on
// sync/actions calls, which then use it server-side for that one request. It
// is never written to deck.db and never sent anywhere else.
const KEY = "deck.githubPat";

export function getPat(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(KEY);
}

export function setPat(token: string): void {
  window.localStorage.setItem(KEY, token);
}

export function clearPat(): void {
  window.localStorage.removeItem(KEY);
}

// Every GitHub-touching fetch goes through this so the PAT rides along when
// set. Returns the headers to merge into the request.
export function authHeaders(): Record<string, string> {
  const t = getPat();
  return t ? { authorization: `Bearer ${t}` } : {};
}
