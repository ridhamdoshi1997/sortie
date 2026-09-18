import { History } from "lucide-react";

type ActivityType = "job_found" | "researched";

type ActivityItem = {
  id: string;
  text: string;
  time: string;
  type: ActivityType;
};

type Props = {
  items: ActivityItem[];
};

// Signal redesign: this was a two-tone dotted list — success-green for
// "found", info-blue for "researched" — which put two colours on the
// dashboard that exist nowhere else in the Signal palette, and encoded
// information the row text already states outright ("Found 14 jobs…" vs
// "Researched Notion"). The mockup drops the dots for exactly that reason.
// Now a flush hairline-separated list with the timestamp right-aligned and
// a 3px hover nudge, matching the mockup's .activity-item.
export function RecentActivity({ items }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="flex items-center gap-3">
        <span className="icon-chip-neutral">
          <History className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold leading-6 text-text-primary">Recent Activity</h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-5 text-sm text-text-muted">
          No activity yet. Start by finding jobs on the Find Jobs page.
        </p>
      ) : (
        <ul className="mt-3">
          {items.map((item) => (
            <li key={item.id} className="signal-activity-item">
              <span
                className={`signal-pulse-dot ${
                  item.type === "researched" ? "signal-pulse-dot-hollow" : ""
                }`}
              />
              <span className="min-w-0 flex-1 text-[13px] leading-5 text-text-secondary">
                {item.text}
              </span>
              <span className="shrink-0 whitespace-nowrap font-mono text-[11px] text-text-muted">
                {item.time}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
