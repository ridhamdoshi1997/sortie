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

export function ApplicationHistory({ history }: { history: JobEventHistoryItem[] }) {
  if (history.length === 0) return null;

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <History className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Application History</h2>
      </div>

      <ol className="flex flex-col gap-4">
        {history.map((item) => (
          <li key={item.id} className="flex gap-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT_CLASS_BY_KIND[item.kind]}`} />
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
    </section>
  );
}
