import { AlertTriangle } from "lucide-react";

import type { SupportDashboard } from "@/lib/admin/support";
import { SLA_FIRST_RESPONSE_HOURS } from "@/lib/admin/support";

function formatDuration(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function formatAge(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// SLA/stats dashboard (direct user request: "all the related data and
// SLAs"). SLA_FIRST_RESPONSE_HOURS (24h) is a sensible default, not a
// number the user specified — shown explicitly in the breach card's own
// label so it's never a silent, unexplained threshold.
export function SupportDashboardStats({ dashboard }: { dashboard: SupportDashboard }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      <StatCard label="Open" value={dashboard.openCount} />
      <StatCard label="Pending" value={dashboard.pendingCount} />
      <StatCard label="Resolved" value={dashboard.resolvedCount} />
      <StatCard label="Avg. first response" value={formatDuration(dashboard.avgFirstResponseMinutes)} />
      <StatCard label="Oldest open ticket" value={formatAge(dashboard.oldestOpenAgeHours)} />
      <div
        className={`rounded-2xl border p-4 shadow-card ${
          dashboard.slaBreachCount > 0 ? "border-error/30 bg-error/5" : "border-border bg-surface"
        }`}
      >
        <div className="flex items-center gap-1.5">
          {dashboard.slaBreachCount > 0 && <AlertTriangle className="h-3.5 w-3.5 text-error" />}
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">SLA breaches</p>
        </div>
        <p className={`mt-2 font-mono text-2xl font-semibold ${dashboard.slaBreachCount > 0 ? "text-error" : "text-text-primary"}`}>
          {dashboard.slaBreachCount}
        </p>
        <p className="mt-1 text-[11px] text-text-muted">Open, no reply, &gt;{SLA_FIRST_RESPONSE_HOURS}h</p>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
