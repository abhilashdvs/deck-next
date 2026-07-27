import Database from "better-sqlite3";

// One-time cleanup for the duplicate pr_conflict rows produced by the
// UNKNOWN-mergeable bug fixed in lib/sync.ts's normalizePr (see
// docs/superpowers/specs/2026-07-16-detail-sheet-ux-rework-design.md).
// Keeps only the newest pr_conflict row per (item_id, summary) pair;
// every other activity row is untouched.
export const PURGE_SQL = `
  DELETE FROM activity
  WHERE type = 'pr_conflict'
    AND id NOT IN (
      SELECT MAX(id) FROM activity WHERE type = 'pr_conflict' GROUP BY item_id, summary
    );
`;

function main() {
  const dbPath = process.argv[2] ?? "deck.db";
  console.log(`Purging duplicate pr_conflict rows from ${dbPath}`);
  console.log("Make sure you have backed up this file first (cp deck.db deck.db.bak) — this is destructive.");
  const db = new Database(dbPath);
  const before = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'pr_conflict'").get().n;
  db.exec(PURGE_SQL);
  const after = db.prepare("SELECT COUNT(*) AS n FROM activity WHERE type = 'pr_conflict'").get().n;
  console.log(`pr_conflict rows: ${before} -> ${after} (removed ${before - after})`);
  db.close();
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
