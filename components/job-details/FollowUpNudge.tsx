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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3">
      <div className="flex items-start gap-2.5 text-sm text-warning">
        <Clock className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-5">
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
