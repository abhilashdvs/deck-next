// GitHub job logs prefix every line with an ISO timestamp and mark real
// failures with ##[error]. Those markers carry the entire actionable payload —
// the log's tail is git cleanup and deprecation warnings, so there is
// deliberately no tail-based fallback.
const ERROR_LINE = /^\S+\s+##\[error\](.*)$/;
const MAX_ERRORS = 20;

export function extractErrors(log: string): { errors: string[]; truncated: number } {
  const all: string[] = [];
  for (const line of log.split("\n")) {
    const m = ERROR_LINE.exec(line.replace(/\r$/, ""));
    // A bare `##[error]` with nothing after it carries no information. Pushing
    // "" would render a blank row and, worse, make errors.length > 0 true —
    // suppressing both the "no error markers" and "couldn't load" fallbacks so
    // the panel shows an empty box. It was never an error, so it also must not
    // consume a MAX_ERRORS slot or count toward `truncated`.
    if (m && m[1].trim()) all.push(m[1].trim());
  }
  return { errors: all.slice(0, MAX_ERRORS), truncated: Math.max(0, all.length - MAX_ERRORS) };
}
