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
>;

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
