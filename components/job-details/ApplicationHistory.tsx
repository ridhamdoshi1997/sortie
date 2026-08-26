import { History } from "lucide-react";

import { formatDate } from "@/lib/utils";
import type { JobEventHistoryItem } from "@/actions/careerEvents";

// Per-job event history — application_events/interview_events/compensation_events
// (§Q1) have only ever been written from this page (JobActionBar's status
// changes), never read back on it. The only place this data was visible
// before was the global /career flat timeline, mixed in with every other
// job. Zero AI, zero new tables — purely a job-scoped read of data that
// already exists.
const DOT_CLASS_BY_KIND: Record<JobEventHistoryItem["kind"], string> = {
  application: "bg-accent",
  interview: "bg-info",
  compensation: "bg-success",
};

// Pane inside the shared Tracking card (app/find-jobs/[id]/page.tsx) — see
// JobDeadline.tsx's comment for why this dropped its own border/shadow/
// icon-chip header (professional-polish pass, 2026-08-25).
//
// Real connected timeline, not isolated dots (2026-08-25, direct user
// report — Tracking tab still not "up to par"). A single hairline runs
// behind every dot; each opaque, kind-colored dot sits on top of it
// (z-10), which is enough to read as one continuous line without needing
// a ring/cutout trick.
export function ApplicationHistory({ history }: { history: JobEventHistoryItem[] }) {
  if (history.length === 0) return null;

  return (
    <div className="border-t border-border-light px-6 py-6 first:border-t-0">
      <h3 className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        <History className="h-3.5 w-3.5" />
        Application History
      </h3>

      <div className="relative">
        {history.length > 1 && (
          <span className="absolute bottom-1 left-1 top-1 w-px bg-border-light" aria-hidden="true" />
        )}
        <ol className="relative flex flex-col gap-5">
          {history.map((item, i) => (
            <li
              key={item.id}
              className="dim-card-in flex gap-3"
              style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            >
              <span className={`relative z-10 mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS_BY_KIND[item.kind]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className="text-sm font-medium text-text-primary">{item.label}</p>
                  <p className="text-xs text-text-muted">{formatDate(item.date)}</p>
                </div>
                {item.notes && <p className="mt-1 text-sm leading-6 text-text-secondary">{item.notes}</p>}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
