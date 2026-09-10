import { sqliteTable, integer, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";

export const workItems = sqliteTable("work_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  type: text("type").notNull().default("task"),
  status: text("status").notNull().default("todo"),
  statusLocked: integer("status_locked").notNull().default(0),
  priority: text("priority"),
  nextAction: text("next_action"),
  notes: text("notes"),
  blockedReason: text("blocked_reason"),
  tags: text("tags").notNull().default("[]"),
  position: integer("position").notNull().default(0),
  snoozedUntil: text("snoozed_until"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const linkedSources = sqliteTable(
  "linked_sources",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    externalId: text("external_id"),
    repo: text("repo"),
    number: integer("number"),
    url: text("url"),
    title: text("title"),
    state: text("state"),
    role: text("role"),
    targetBranch: text("target_branch"),
    stackedOn: text("stacked_on"),
    mergeOrder: integer("merge_order"),
    mergeable: text("mergeable"),
    commentsCount: integer("comments_count"),
    unresolvedThreads: integer("unresolved_threads"),
    meta: text("meta"),
    lastSyncedAt: text("last_synced_at"),
  },
  (t) => [
    uniqueIndex("idx_sources_dedup").on(t.kind, t.externalId),
    index("idx_sources_item").on(t.itemId),
  ],
);

export const checklistItems = sqliteTable("checklist_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  itemId: integer("item_id")
    .notNull()
    .references(() => workItems.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  subtext: text("subtext"),
  done: integer("done").notNull().default(0),
  position: integer("position").notNull().default(0),
});

export const savedViews = sqliteTable("saved_views", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  filter: text("filter").notNull().default("{}"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const activity = sqliteTable(
  "activity",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    itemId: integer("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    summary: text("summary").notNull(),
    data: text("data"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("idx_activity_item").on(t.itemId)],
);

// PRs the user authored or is reviewing, across every repo — populated by the
// "my PRs" sync (`gh search prs`). Not linked to work items: this table backs
// the PRs tab, which is a flat inbox, not a task board.
export const myPrs = sqliteTable(
  "my_prs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    externalId: text("external_id").notNull(),
    repo: text("repo").notNull(),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    state: text("state").notNull(),
    isDraft: integer("is_draft").notNull().default(0),
    role: text("role").notNull().default("author"),
    reviewDecision: text("review_decision"),
    mergeable: text("mergeable"),
    commentsCount: integer("comments_count"),
    unresolvedThreads: integer("unresolved_threads"),
    checks: text("checks"),
    updatedAt: text("updated_at").notNull(),
    lastSyncedAt: text("last_synced_at").notNull(),
  },
  (t) => [uniqueIndex("idx_my_prs_dedup").on(t.externalId)],
);
