import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, Sparkles } from "lucide-react";

import type { DashboardInsight } from "@/lib/dashboardInsights";

// Hero widget of the redesigned dashboard (build-plan.md §P) — replaces the
// old 4 flat stat tiles' "rearview mirror" framing with a "what do you need
// to do next" one. Deterministic, not a live AI call (see
// lib/dashboardInsights.ts's header comment) — the "AI" in the name reflects
// that these read like something an assistant would flag, not that a model
// call happens on every dashboard load.
//
// Visual-hierarchy pass (2026-08-18, researched via agy) — this is the
// grid's "anchor" card: `.dashboard-hero-card` (globals.css) gives it an
// accent-tinted border + inset hairline instead of the plain flat
// border+shadow every other card uses, larger padding (p-8 vs p-6), and a
// bigger insight-count number to establish it as the heaviest element in
// the grid — see that class's own comment for why a static gradient wash
// (agy's literal suggestion) was substituted for this token-step approach.
export function AIActionCenter({ insights }: { insights: DashboardInsight[] }) {
  return (
    <div className="dashboard-hero-card flex h-full flex-col rounded-2xl p-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-base font-semibold leading-6 text-text-primary">Action Center</h2>
        </div>
        {insights.length > 0 && (
          <span className="font-mono text-2xl font-semibold leading-none tracking-tight text-accent">
            {insights.length}
          </span>
        )}
      </div>

      {insights.length === 0 ? (
        <p className="mt-5 text-sm text-text-muted">
          Nothing needs your attention right now — you&apos;re caught up.
        </p>
      ) : (
        <ul className="mt-5 flex flex-1 flex-col gap-2.5">
          {insights.map((insight) => {
            const Icon = insight.tone === "warning" ? AlertTriangle : Info;
            return (
              <li key={insight.id}>
                <Link
                  href={insight.href}
                  className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                    insight.tone === "warning"
                      ? "border-warning/20 bg-warning/5 text-warning hover:bg-warning/10"
                      : "border-info/20 bg-info-lightest text-info-foreground hover:bg-info-light"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 font-medium leading-5">{insight.message}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
