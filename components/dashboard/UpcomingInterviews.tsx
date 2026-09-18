import Link from "next/link";
import { CalendarClock } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";

type InterviewJob = {
  id: string;
  title: string | null;
  company: string | null;
  company_logo_url: string | null;
};

// Only rendered by the caller when at least one job is actually interviewing
// (build-plan.md §P: "dynamic, only appears when a real interview exists")
// — app/dashboard/page.tsx gates this, not the component itself, so an
// empty-state message never has to be invented here.
export function UpcomingInterviews({ jobs }: { jobs: InterviewJob[] }) {
  return (
    <div className="flex h-full flex-col border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-accent-light text-accent">
          <CalendarClock className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Interviewing</h2>
      </div>
      <ul className="mt-4 flex flex-1 flex-col gap-2.5">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              href={`/find-jobs/${job.id}`}
              className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-surface-secondary"
            >
              <CompanyLogo company={job.company} logoUrl={job.company_logo_url} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-text-primary">{job.title ?? "Untitled role"}</p>
                <p className="truncate text-xs text-text-muted">{job.company ?? "Unknown company"}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
