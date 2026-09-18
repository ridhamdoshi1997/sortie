import Link from "next/link";
import { Filter } from "lucide-react";

import { STATUS_LABELS, type ApplicationStatus } from "@/lib/applicationStatus";

// Funnel stages only — Shortlisted/Applied/Interviewing/Offered track
// forward progression through the pipeline. Rejected is a real, important
// outcome but isn't part of a "how far did this get" funnel shape, so it's
// deliberately excluded here (build-plan.md §P calls this "Saved→Applied→
// Interviewing→Offered" — "Shortlisted" is this app's real first Kanban
// stage, the closest actual equivalent; there's no separate "Saved"
// application status in this schema, jobs.is_saved is an unrelated bookmark
// toggle). "Inbox" (pre-pipeline, untriaged) is excluded too — Inbox/
// Pipeline split, direct user request: an unreviewed job was never really
// "backlog," and counting it that way is what made this funnel misleading.
const FUNNEL_STAGES: ApplicationStatus[] = ["shortlisted", "applied", "interviewing", "offered"];

export function PipelineFunnel({ counts }: { counts: Record<ApplicationStatus, number> }) {
  const maxCount = Math.max(1, ...FUNNEL_STAGES.map((s) => counts[s] ?? 0));

  return (
    <div className="flex h-full flex-col border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex items-center gap-3">
        <span className="icon-chip-neutral">
          <Filter className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Pipeline Funnel</h2>
      </div>
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
              {/* Signal redesign: the mockup's .funnel-track/.funnel-fill —
                  amber gradient with a soft glow, and driven by scaleX
                  rather than width so it composites instead of laying out
                  on every frame. */}
              <div className="signal-funnel-track w-full">
                <div
                  className="signal-funnel-fill signal-fill-in group-hover:opacity-90"
                  style={
                    { "--fill": Math.min(1, Math.max(0, widthPercent / 100)) } as React.CSSProperties
                  }
                />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
