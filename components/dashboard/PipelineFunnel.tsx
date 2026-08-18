import Link from "next/link";

import { STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";

// Funnel stages only — Draft/Applied/Interviewing/Offered track forward
// progression through the pipeline. Rejected is a real, important outcome
// but isn't part of a "how far did this get" funnel shape, so it's
// deliberately excluded here (build-plan.md §P calls this "Saved→Applied→
// Interviewing→Offered" — "Draft" is this app's real first Kanban stage,
// the closest actual equivalent; there's no separate "Saved" application
// status in this schema, jobs.is_saved is an unrelated bookmark toggle).
const FUNNEL_STAGES: ApplicationStatus[] = ["draft", "applied", "interviewing", "offered"];

export function PipelineFunnel({ counts }: { counts: Record<ApplicationStatus, number> }) {
  const maxCount = Math.max(1, ...FUNNEL_STAGES.map((s) => counts[s] ?? 0));

  return (
    <div className="flex h-full flex-col border border-border bg-surface shadow-card rounded-2xl p-6">
      <h2 className="text-base font-semibold leading-6 text-text-primary">Pipeline Funnel</h2>
      <div className="mt-4 flex flex-1 flex-col justify-center gap-2.5">
        {FUNNEL_STAGES.map((stage) => {
          const count = counts[stage] ?? 0;
          const widthPercent = Math.max(12, Math.round((count / maxCount) * 100));
          return (
            <Link
              key={stage}
              href={`/missions?stage=${stage}`}
              className="group block"
            >
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-text-secondary group-hover:text-text-primary">
                  {STATUS_LABELS[stage]}
                </span>
                <span className="font-mono font-semibold text-text-primary">{count}</span>
              </div>
              {/* Micro-bar (agy research, 2026-08-18) — thinned from the
                  original h-2.5 track to a 3px "instrument" line with a
                  soft glow on the fill, closer to how Linear/Vercel treat
                  inline progress indicators than a thick utilitarian bar. */}
              <div className="h-[3px] w-full overflow-hidden rounded-full bg-surface-secondary">
                <div
                  className="h-full rounded-full bg-accent transition-[width] group-hover:opacity-90"
                  style={{
                    width: `${widthPercent}%`,
                    boxShadow: "0 0 6px color-mix(in srgb, var(--color-accent) 55%, transparent)",
                  }}
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
