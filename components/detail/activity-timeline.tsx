"use client";

import {
  Plus,
  ArrowRight,
  Link2,
  GitMerge,
  TriangleAlert,
  StickyNote,
  CheckSquare,
} from "lucide-react";
import { useActivity } from "@/hooks/use-activity";
import { relativeTime } from "@/lib/relative-time";
import type { ActivityType } from "@/lib/types";

const ICON: Record<ActivityType, typeof Plus> = {
  created: Plus,
  status: ArrowRight,
  source_linked: Link2,
  pr_merged: GitMerge,
  pr_conflict: TriangleAlert,
  note: StickyNote,
  checklist: CheckSquare,
};

export function ActivityTimeline({ id }: { id: number }) {
  const { activity } = useActivity(id);
  if (!activity.length) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-faint">
        Activity
      </div>
      <div className="flex flex-col gap-2.5">
        {activity.map((a) => {
          const Icon = ICON[a.type] ?? Plus;
          const tint =
            a.type === "pr_conflict"
              ? "text-st-blocked"
              : a.type === "pr_merged"
                ? "text-primary"
                : "text-text-faint";
          return (
            <div key={a.id} className="flex items-start gap-2.5 text-[12px]">
              <Icon className={`mt-px size-3.5 shrink-0 ${tint}`} />
              <span className="text-muted-foreground">{a.summary}</span>
              <span className="ml-auto shrink-0 text-[10.5px] text-text-faint">
                {relativeTime(a.createdAt)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
