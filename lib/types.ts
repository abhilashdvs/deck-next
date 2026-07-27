export type ItemType = "feature" | "bug" | "oncall" | "task" | "chore";
export type Status = "todo" | "in_progress" | "in_review" | "blocked" | "done";
export type Priority = "p0" | "p1" | "p2" | "p3";
export type SourceKind = "github_pr" | "devrev_issue" | "devrev_ticket" | "slack" | "url";
export type SourceRole = "base" | "stacked" | "docs" | "other";

export const STATUSES: Status[] = ["todo", "in_progress", "in_review", "blocked", "done"];
export const STATUS_LABELS: Record<Status, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  blocked: "Blocked",
  done: "Done",
};

export interface WorkItem {
  id: number;
  title: string;
  type: ItemType;
  status: Status;
  statusLocked: 0 | 1;
  priority: Priority | null;
  nextAction: string | null;
  notes: string | null;
  blockedReason: string | null;
  tags: string[];
  position: number;
  snoozedUntil: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedSource {
  id: number;
  itemId: number;
  kind: SourceKind;
  externalId: string | null;
  repo: string | null;
  number: number | null;
  url: string | null;
  title: string | null;
  state: string | null;
  role: SourceRole | null;
  targetBranch: string | null;
  stackedOn: string | null;
  mergeOrder: number | null;
  mergeable: string | null;
  commentsCount: number | null;
  unresolvedThreads: number | null;
  meta: Record<string, unknown> | null;
  lastSyncedAt: string | null;
}

// Required checks that have REPORTED on the latest commit — not the total
// configured on the base branch. A required check that never ran is absent from
// GitHub's rollup and cannot be counted, which is why no surface renders a
// denominator.
export interface PrChecks {
  required: number;
  passing: number;
  failing: number;
  pending: number;
  failed: { name: string; url: string | null }[];
}

export interface ChecklistItem {
  id: number;
  itemId: number;
  text: string;
  subtext: string | null;
  done: 0 | 1;
  position: number;
}

export interface ItemDetail extends WorkItem {
  sources: LinkedSource[];
  checklist: ChecklistItem[];
}

export interface ItemFilters {
  status?: Status;
  type?: ItemType;
  priority?: Priority;
  repo?: string;
  tag?: string;
  q?: string;
  needsAttention?: boolean;
}

export type ActivityType =
  | "created"
  | "status"
  | "source_linked"
  | "pr_merged"
  | "pr_conflict"
  | "note"
  | "checklist";

export interface Activity {
  id: number;
  itemId: number;
  type: ActivityType;
  summary: string;
  data: Record<string, unknown> | null;
  createdAt: string;
}

export interface SavedView {
  id: number;
  name: string;
  filter: ItemFilters;
  position: number;
  createdAt: string;
}

export interface CreateItemInput {
  title: string;
  type?: ItemType;
  status?: Status;
  priority?: Priority | null;
  nextAction?: string | null;
  notes?: string | null;
  tags?: string[];
  position?: number;
}

export interface ImportRecord {
  kind: SourceKind;
  externalId: string;
  repo?: string;
  number?: number;
  url?: string;
  title?: string;
  state?: string;
  role?: SourceRole;
  targetBranch?: string;
  stackedOn?: string;
  mergeOrder?: number;
  mergeable?: string;
  commentsCount?: number;
  unresolvedThreads?: number;
  meta?: Record<string, unknown>;
  item?: { title: string; type?: ItemType; priority?: Priority };
}

export function nowIso(): string {
  return new Date().toISOString();
}
