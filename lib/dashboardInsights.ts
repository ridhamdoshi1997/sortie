import { getListingSignal } from "@/lib/jobStatus";
import type { Job } from "@/types";

export type DashboardInsight = {
  id: string;
  message: string;
  href: string;
  tone: "warning" | "info";
};

type InsightJob = Pick<
  Job,
  | "id"
  | "application_status"
  | "application_status_updated_at"
  | "found_at"
  | "marked_unavailable_at"
  | "dropped_from_search_at"
  | "is_hidden"
  | "next_deadline_at"
  | "next_deadline_label"
>;

// "Today"/focus-view request (build-plan.md §H) — deliberately NOT built as
// a separate page. This Action Center already IS the "what needs my
// attention" surface build-plan.md's "Today view" row was asking for; a
// second page would duplicate it, the same near-duplicate-surface mistake
// this project has caught and reverted before (e.g. the per-job Ask
// Navigator vs. the global Navigator). A "follow-up due" insight was
// considered too, but lib/followUpNudge.ts's own 7-day threshold on
// applied-status jobs is a strict subset of the STALE_APPLIED_DAYS signal
// already below (14 days, same underlying "applied" + time-elapsed
// condition) — adding it would just double-count the same jobs under two
// labels, not surface anything new. Deadlines are the one genuinely
// separate signal (a real future date, not a time-since-status heuristic).
const DEADLINE_WINDOW_DAYS = 7;

// Anything sitting in "Applied" this long without a status change is worth a
// second look — not proof of ghosting (rejection_diagnosis already handles
// per-job honesty about that), just a threshold worth surfacing in
// aggregate.
const STALE_APPLIED_DAYS = 14;

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (24 * 60 * 60 * 1000);
}

// The dashboard's "AI Action Center" — deterministic, zero AI cost, same
// philosophy as lib/outcomeInsights.ts and every other dashboard widget on
// this page. A dashboard loaded on every visit is exactly the wrong place
// for a live LLM call per view (cost, latency); every "insight" here is
// derived from data this app already has, not generated fresh. Capped at 3
// per build-plan.md §P's "1-3 specific... prompts" scope — a dashboard that
// nags with everything at once stops being actionable.
export function computeDashboardInsights(
  jobs: InsightJob[],
  profileCompletionPercent: number,
): DashboardInsight[] {
  const insights: DashboardInsight[] = [];
  const active = jobs.filter((j) => !j.is_hidden);

  const staleApplied = active.filter(
    (j) =>
      j.application_status === "applied" &&
      j.application_status_updated_at &&
      daysSince(j.application_status_updated_at) >= STALE_APPLIED_DAYS,
  );
  if (staleApplied.length > 0) {
    insights.push({
      id: "stale-applied",
      message: `${staleApplied.length} application${staleApplied.length === 1 ? "" : "s"} in Applied with no update for ${STALE_APPLIED_DAYS}+ days — worth a Rejection Intelligence check`,
      href: "/missions",
      tone: "warning",
    });
  }

  const needsAttention = active.filter((j) => {
    if (j.application_status === "rejected") return false;
    const signal = getListingSignal(j);
    return signal?.level === "confirmed" || signal?.level === "likely";
  });
  if (needsAttention.length > 0) {
    insights.push({
      id: "needs-attention",
      message: `${needsAttention.length} tracked job${needsAttention.length === 1 ? "" : "s"} may no longer be available`,
      href: "/missions",
      tone: "warning",
    });
  }

  const upcomingDeadlines = active.filter((j) => {
    if (!j.next_deadline_at) return false;
    const daysUntil = (new Date(j.next_deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return daysUntil >= 0 && daysUntil <= DEADLINE_WINDOW_DAYS;
  });
  if (upcomingDeadlines.length > 0) {
    insights.push({
      id: "upcoming-deadlines",
      message:
        upcomingDeadlines.length === 1
          ? `1 deadline in the next ${DEADLINE_WINDOW_DAYS} days${upcomingDeadlines[0].next_deadline_label ? ` — ${upcomingDeadlines[0].next_deadline_label}` : ""}`
          : `${upcomingDeadlines.length} deadlines in the next ${DEADLINE_WINDOW_DAYS} days`,
      href: upcomingDeadlines.length === 1 ? `/find-jobs/${upcomingDeadlines[0].id}` : "/missions",
      tone: "warning",
    });
  }

  if (profileCompletionPercent < 100) {
    insights.push({
      id: "profile-incomplete",
      message: `Your profile is ${profileCompletionPercent}% complete — finish it for stronger matches`,
      href: "/profile",
      tone: "info",
    });
  }

  return insights.slice(0, 3);
}
