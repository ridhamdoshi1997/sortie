import Link from "next/link";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { formatTimeAgo } from "@/lib/utils";
import type { Job } from "@/types";

type RecentlyViewedJob = Pick<
  Job,
  "id" | "title" | "company" | "company_logo_url" | "external_apply_url" | "match_score" | "last_viewed_at"
>;

// Server component, not client — formatTimeAgo runs once at render time on
// the server and the string ships straight into the HTML, so there's no
// hydration-mismatch risk the way FindJobsForm's client-side lastRunLabel
// has (nothing recomputes this on the client after mount).
export function RecentlyViewed({ jobs }: { jobs: RecentlyViewedJob[] }) {
  if (jobs.length === 0) return null;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
        Recently viewed
      </p>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/find-jobs/${job.id}`}
            className="flex w-64 flex-shrink-0 items-center gap-3 rounded-xl border border-border bg-surface p-3 shadow-card transition-colors hover:bg-surface-secondary"
          >
            <CompanyLogo company={job.company} logoUrl={job.company_logo_url} applyUrl={job.external_apply_url} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text-primary">{job.title}</p>
              <p className="truncate text-xs text-text-secondary">{job.company}</p>
              {job.last_viewed_at && (
                <p className="mt-0.5 font-mono text-[10px] text-text-muted">
                  {formatTimeAgo(job.last_viewed_at)}
                </p>
              )}
            </div>
            {job.match_score !== undefined && job.match_score !== null && (
              <span className="font-mono text-sm font-semibold tabular-nums text-text-secondary">
                {job.match_score}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
