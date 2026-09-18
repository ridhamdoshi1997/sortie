import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

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
        <div className="flex items-center gap-3">
          <span className="icon-chip-neutral">
            <Sparkles className="h-4 w-4" />
          </span>
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
        // Signal redesign: the mockup's Action Center rail. Was two tinted
        // card styles (warning-amber and info-BLUE) — the blue was a third
        // accent that exists nowhere else in the Signal palette. Now a
        // neutral bordered row carrying a status dot, with the urgent tone
        // marked by a warm amber pulsing dot instead of a whole tinted card.
        // Same signal-in-the-dot language as the Career rails.
        <ul className="mt-5 flex flex-1 flex-col gap-2">
          {insights.map((insight) => (
            <li key={insight.id}>
              <Link
                href={insight.href}
                className={`signal-track rounded-xl border border-border ${
                  insight.tone === "warning" ? "signal-track-warm" : ""
                }`}
              >
                <span className="signal-dot" />
                <span className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-text-primary">
                  {insight.message}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-muted" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
