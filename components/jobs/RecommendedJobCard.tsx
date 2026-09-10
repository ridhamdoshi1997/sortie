import { BriefcaseBusiness, ExternalLink, MapPin } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { formatPostedAge } from "@/lib/jobFreshness";
import type { RecommendedJob } from "@/lib/jobRecommendations";

// Read-only by design — these are free-cache rows, not yet a persisted
// `jobs` table entry for this user, so there's no id to hang Save/Hide/
// Status actions off (see lib/jobRecommendations.ts's header comment for
// why this tab never pays to promote them into that table on every view).
// Clicking through goes straight to the employer's real posting.
export function RecommendedJobCard({ job }: { job: RecommendedJob }) {
  const age = formatPostedAge(job.postedAt);
  const href = job.applyUrl || job.url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CompanyLogo company={job.company} logoUrl={job.logoUrl ?? null} applyUrl={job.applyUrl ?? null} size="sm" />
          <div>
            <p className="font-medium leading-snug text-text-primary">{job.title}</p>
            <p className="text-sm text-text-secondary">{job.company}</p>
          </div>
        </div>
        <ExternalLink className="mt-1 h-4 w-4 shrink-0 text-text-muted" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
        {job.location && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
        )}
        {job.type && (
          <span className="inline-flex items-center gap-1">
            <BriefcaseBusiness className="h-3 w-3" />
            {job.type}
          </span>
        )}
        {age && <span>{age.label}</span>}
      </div>

      {job.matchedSkills.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {job.matchedSkills.map((skill) => (
            <span
              key={skill}
              className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] text-text-secondary"
            >
              {skill}
            </span>
          ))}
        </div>
      )}
    </a>
  );
}
