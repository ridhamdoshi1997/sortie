import Link from "next/link";
import { Radar } from "lucide-react";

import { CATEGORY_LABELS, type RejectionDiagnosisResult } from "@/lib/rejectionIntelligence";

type RejectedJob = {
  id: string;
  title: string | null;
  company: string | null;
  rejection_diagnosis: RejectionDiagnosisResult | null;
};

// Reuse-only, zero new AI calls — every job here already has a real
// rejection_diagnosis generated at some earlier point (the job detail
// page's own "Why the silence?" flow, lib/rejectionIntelligence.ts). This
// widget just surfaces what already exists, it never diagnoses on its own.
export function RejectionRadar({ jobs }: { jobs: RejectedJob[] }) {
  const diagnosed = jobs.filter((j) => j.rejection_diagnosis !== null);

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-2">
        <Radar className="h-4 w-4 text-warning" />
        <h2 className="text-base font-semibold leading-6 text-text-primary">Rejection Intelligence</h2>
      </div>

      {diagnosed.length === 0 ? (
        <p className="mt-5 text-sm text-text-muted">
          No diagnosed rejections yet — run &quot;Why the silence?&quot; on a rejected job&apos;s page to see it here.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {diagnosed.slice(0, 4).map((job) => {
            const topReason = job.rejection_diagnosis!.possibleReasons[0];
            return (
              <li key={job.id}>
                <Link
                  href={`/find-jobs/${job.id}`}
                  className="flex items-start justify-between gap-3 rounded-lg p-1.5 transition-colors hover:bg-surface-secondary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">{job.title ?? "Untitled role"}</p>
                    <p className="truncate text-xs text-text-muted">{job.company ?? "Unknown company"}</p>
                  </div>
                  {topReason && (
                    <span className="shrink-0 rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning">
                      {CATEGORY_LABELS[topReason.category]}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
