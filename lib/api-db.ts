import { getDb, type DrizzleDb } from "./db";

let _db: DrizzleDb | null = null;

export function db(): DrizzleDb {
  return (_db ??= getDb(process.env.DECK_DB ?? "deck.db"));
}

// Test seam: inject an isolated in-memory db.
export function _setTestDb(d: DrizzleDb | null): void {
  _db = d;
}
