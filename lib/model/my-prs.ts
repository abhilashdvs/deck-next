import { eq, desc } from "drizzle-orm";
import type { DrizzleDb } from "@/lib/db";
import { myPrs } from "@/lib/schema";
import { nowIso, type PrChecks } from "@/lib/types";

export interface MyPr {
  id: number;
  externalId: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft: 0 | 1;
  role: "author" | "reviewer";
  reviewDecision: string | null;
  mergeable: string | null;
  commentsCount: number | null;
  unresolvedThreads: number | null;
  checks: PrChecks | null;
  updatedAt: string;
  lastSyncedAt: string;
}

export interface MyPrInput {
  externalId: string;
  repo: string;
  number: number;
  title: string;
  url: string;
  state: string;
  isDraft?: boolean;
  role: "author" | "reviewer";
  reviewDecision?: string | null;
  mergeable?: string | null;
  commentsCount?: number | null;
  unresolvedThreads?: number | null;
  checks?: PrChecks | null;
  updatedAt: string;
}

export function hydrateMyPr(row: typeof myPrs.$inferSelect): MyPr {
  return {
    ...row,
    isDraft: row.isDraft as 0 | 1,
    role: row.role as MyPr["role"],
    checks: row.checks ? JSON.parse(row.checks) : null,
  };
}

export function listMyPrs(db: DrizzleDb): MyPr[] {
  return db.select().from(myPrs).orderBy(desc(myPrs.updatedAt)).all().map(hydrateMyPr);
}

// Upsert by externalId — a PR you author that someone also requested review on
// stays one row; the later sync's role wins.
export function upsertMyPr(db: DrizzleDb, input: MyPrInput): void {
  const existing = db.select({ id: myPrs.id }).from(myPrs).where(eq(myPrs.externalId, input.externalId)).get();
  const values = {
    externalId: input.externalId,
    repo: input.repo,
    number: input.number,
    title: input.title,
    url: input.url,
    state: input.state,
    isDraft: input.isDraft ? 1 : 0,
    role: input.role,
    reviewDecision: input.reviewDecision ?? null,
    mergeable: input.mergeable ?? null,
    commentsCount: input.commentsCount ?? null,
    unresolvedThreads: input.unresolvedThreads ?? null,
    checks: input.checks ? JSON.stringify(input.checks) : null,
    updatedAt: input.updatedAt,
    lastSyncedAt: nowIso(),
  };
  if (existing) {
    db.update(myPrs).set(values).where(eq(myPrs.id, existing.id)).run();
  } else {
    db.insert(myPrs).values(values).run();
  }
}

// Replace the whole set: PRs not in this sync's payload are deleted (merged/closed
// PRs age out of `gh search prs --state=open` naturally).
export function replaceMyPrs(db: DrizzleDb, inputs: MyPrInput[]): void {
  db.transaction((txRaw) => {
    const tx = txRaw as unknown as DrizzleDb;
    tx.delete(myPrs).run();
    for (const input of inputs) upsertMyPr(tx, input);
  });
}
