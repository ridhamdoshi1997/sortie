import Link from "next/link";
import { MapPin } from "lucide-react";

import { Card } from "@/components/ui/card";
import type { Job } from "@/types";

function scoreTierClass(score: number) {
  if (score >= 80) return "text-success";
  if (score >= 60) return "text-info";
  return "text-warning";
}

// Real tag pills from actual job fields — never fabricated placeholder tags.
function jobTags(job: Job): string[] {
  const tags: string[] = [];
  if (job.job_type) tags.push(job.job_type);
  if (job.location && /remote/i.test(job.location)) tags.push("Remote");
  if (Array.isArray(job.matched_skills)) tags.push(...job.matched_skills.slice(0, 2));
  return tags.slice(0, 3);
}

export function JobResultCard({ job }: { job: Job }) {
  const tags = jobTags(job);

  return (
    <Link href={`/find-jobs/${job.id}`}>
      <Card className="glass-panel glass-panel-interactive grid cursor-pointer grid-cols-[1fr_auto] items-start gap-4 rounded-2xl p-5">
        <div>
          <p className="text-[15px] font-semibold leading-tight text-text-primary">{job.title}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
            {job.company}
            {job.location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-accent">
                  <MapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
              </>
            )}
          </p>
          {tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[5px] border border-border px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {job.match_score !== undefined && job.match_score !== null && (
          <div className="text-right">
            <div
              className={`font-mono text-2xl font-semibold tabular-nums ${scoreTierClass(job.match_score)}`}
            >
              {job.match_score}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Match
            </div>
          </div>
        )}

        {/* Agent read — reserved teal treatment for AI-generated content,
            never used for anything else in the app */}
        {job.match_reason && (
          <div className="col-span-2 rounded-r-lg border-l-2 border-agent bg-agent-light px-3.5 py-2.5">
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-agent-dark">
              Agent read
            </p>
            <p className="text-xs leading-5 text-agent-dark">{job.match_reason}</p>
          </div>
        )}
      </Card>
    </Link>
  );
}
