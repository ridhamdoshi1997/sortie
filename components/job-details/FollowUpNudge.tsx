import Link from "next/link";
import { Clock } from "lucide-react";

import { shouldShowFollowUpNudge } from "@/lib/followUpNudge";

// Follow-up timing nudges (build-plan.md §C) — deterministic, zero AI cost.
// Deep-links into EmailDrafts.tsx's follow-up type via `?draft=follow_up`
// rather than duplicating the draft flow here.
export function FollowUpNudge({ applicationStatus, statusUpdatedAt }: { applicationStatus: string | null; statusUpdatedAt: string | null }) {
  const days = shouldShowFollowUpNudge(applicationStatus, statusUpdatedAt);
  if (days === null) return null;

  return (
    // Same neutral-surface + colored-chip recipe as ApplyVerdictBadge/
    // MatchScore's FlagRow (professional-polish pass, 2026-08-25) — was a
    // full bg-warning/10 wash across the whole row.
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/25 bg-surface px-4 py-3">
      <div className="flex items-start gap-3 text-sm text-text-secondary">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-warning/15 text-warning">
          <Clock className="h-4 w-4" />
        </span>
        <p className="pt-1.5 leading-5">
          It&apos;s been {days} days since you applied with no update — worth a follow-up.
        </p>
      </div>
      <Link
        href="?draft=follow_up"
        scroll={false}
        className="inline-flex shrink-0 items-center rounded-lg border border-warning/40 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/10"
      >
        Draft a follow-up
      </Link>
    </div>
  );
}
