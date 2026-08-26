import Link from "next/link";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { formatTimeUntil } from "@/lib/utils";
import type { Job } from "@/types";

type DeadlineJob = Pick<
  Job,
  "id" | "title" | "company" | "company_logo_url" | "next_deadline_at" | "next_deadline_label"
>;

// Server component (MissionsView's parent, app/missions/page.tsx, already
// fetches every job's full row) — no extra query needed, just filter/sort
// what's already on hand. Overdue deadlines stay visible (sorted first,
// warning-colored) rather than disappearing — the user hasn't necessarily
// dealt with them yet, silently dropping them would hide exactly the thing
// this widget exists to surface.
export function UpcomingDeadlines({ jobs }: { jobs: DeadlineJob[] }) {
  const withDeadlines = jobs
    .filter((job): job is DeadlineJob & { next_deadline_at: string } => Boolean(job.next_deadline_at))
    .sort((a, b) => new Date(a.next_deadline_at).getTime() - new Date(b.next_deadline_at).getTime())
    .slice(0, 8);

  if (withDeadlines.length === 0) return null;

  return (
    <div className="w-full">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Upcoming deadlines
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {withDeadlines.map((job, i) => {
          const timeLabel = formatTimeUntil(job.next_deadline_at);
          const overdue = timeLabel === "Overdue";
          return (
            <Link
              key={job.id}
              href={`/find-jobs/${job.id}`}
              className="dim-card-in flex w-64 flex-shrink-0 items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-all hover:-translate-y-0.5 hover:border-accent/30 hover:bg-surface-secondary"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <CompanyLogo company={job.company} logoUrl={job.company_logo_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">
                  {job.next_deadline_label || job.title}
                </p>
                <p className="truncate text-xs text-text-secondary">{job.company}</p>
                <p className={`mt-0.5 font-mono text-[10px] font-semibold ${overdue ? "text-warning" : "text-accent"}`}>
                  {timeLabel}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
