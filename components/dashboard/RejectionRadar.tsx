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
//
// Visual-hierarchy pass (2026-08-18, agy research) — agy suggested a teal
// "AI tinting" wash for any card touching AI content; adapted into a
// restrained left-border accent (mirroring the app's own established
// Agent-Content Callout convention, ui-tokens.md) rather than a gradient
// wash. Also a real correctness fix, not just visual: the category badge
// below is genuinely AI-generated output (rejection_diagnosis), so per this
// app's strict Invariant ("if it came from the agent, it gets this
// treatment; if it didn't, it never does") it belongs in agent-teal, not
// the warning-orange it was using before — that was an inconsistency, not
// a deliberate choice.
export function RejectionRadar({ jobs }: { jobs: RejectedJob[] }) {
  const diagnosed = jobs.filter((j) => j.rejection_diagnosis !== null);

  return (
    <div
      className={`border border-border bg-surface shadow-card rounded-2xl p-6 ${diagnosed.length > 0 ? "border-l-2 border-l-agent" : ""}`}
    >
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
                    <span className="shrink-0 rounded-full bg-agent-light px-2 py-0.5 text-[11px] font-medium text-agent-dark">
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
