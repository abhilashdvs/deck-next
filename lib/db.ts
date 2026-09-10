import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

const DDL = `
CREATE TABLE IF NOT EXISTS work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'task',
  status TEXT NOT NULL DEFAULT 'todo', status_locked INTEGER NOT NULL DEFAULT 0, priority TEXT,
  next_action TEXT, notes TEXT, blocked_reason TEXT, tags TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 0, snoozed_until TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS linked_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, external_id TEXT, repo TEXT, number INTEGER, url TEXT, title TEXT, state TEXT,
  role TEXT, target_branch TEXT, stacked_on TEXT, merge_order INTEGER, mergeable TEXT,
  comments_count INTEGER, unresolved_threads INTEGER, meta TEXT, last_synced_at TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_dedup ON linked_sources(kind, external_id);
CREATE INDEX IF NOT EXISTS idx_sources_item ON linked_sources(item_id);
CREATE TABLE IF NOT EXISTS checklist_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  text TEXT NOT NULL, subtext TEXT, done INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS saved_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, filter TEXT NOT NULL DEFAULT '{}',
  position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  type TEXT NOT NULL, summary TEXT NOT NULL, data TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_activity_item ON activity(item_id);
CREATE TABLE IF NOT EXISTS my_prs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, external_id TEXT NOT NULL, repo TEXT NOT NULL, number INTEGER NOT NULL,
  title TEXT NOT NULL, url TEXT NOT NULL, state TEXT NOT NULL, is_draft INTEGER NOT NULL DEFAULT 0,
  role TEXT NOT NULL DEFAULT 'author', review_decision TEXT, mergeable TEXT,
  comments_count INTEGER, unresolved_threads INTEGER, checks TEXT,
  updated_at TEXT NOT NULL, last_synced_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_my_prs_dedup ON my_prs(external_id);
`;

export type DrizzleDb = BetterSQLite3Database<typeof schema>;

export function getDb(path = "deck.db"): DrizzleDb {
  const sqlite = new Database(path);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  return drizzle(sqlite, { schema });
}
