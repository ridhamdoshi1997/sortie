"use client";

import { useState, useTransition } from "react";
import { Sparkles, TrendingUp } from "lucide-react";

import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { generateOutcomeNarrativeAction } from "@/actions/outcomeInsights";
import { CATEGORY_LABELS } from "@/lib/rejectionIntelligence";
import type { OutcomeStats } from "@/actions/outcomeInsights";
import type { OutcomeNarrativeResult } from "@/lib/outcomeNarrative";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

// §Q3 Application -> Outcome Loop. Deterministic stats (props, computed
// server-side in app/career/page.tsx — zero AI, always shown) plus an
// opt-in AI narrative (client-fetched on click, same "Agent Content"
// agent-teal treatment as every other AI-generated summary in this app —
// renamed from "Agent read" to "AI Navigator reads" per this session's
// earlier label rename).
function RateBar({ label, applied, interviewed, rate }: { label: string; applied: number; interviewed: number; rate: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-text-secondary">{label}</span>
        <span className="text-text-muted">
          {interviewed}/{applied} interviewed · {rate}%
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-border-light">
        <div
          // Signal palette: agent-teal tiers for a rate computed off
          // AI-evaluated jobs, warning only for a genuinely poor one.
          // Was success-green / info-BLUE / warning — the blue in
          // particular existed nowhere else in this design.
          className={`h-2 rounded-full ${rate >= 60 ? "bg-agent" : rate >= 30 ? "bg-agent/55" : "bg-warning"}`}
          style={{ width: `${rate}%` }}
        />
      </div>
    </div>
  );
}

export function OutcomeInsights({ stats }: { stats: OutcomeStats }) {
  const [narrative, setNarrative] = useState<OutcomeNarrativeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateOutcomeNarrativeAction();
      if (!result.success || !result.narrative) {
        setError(result.error ?? "Failed to generate a summary");
        return;
      }
      setNarrative(result.narrative);
    });
  }

  // Two independent data sources feed this section (interview-rate stats
  // off application_events, applied-vs-skipped off the newer job_decisions
  // table) — each already has its own MIN_SAMPLE_SIZE gate, so the section
  // as a whole should only fall back to the empty state when NEITHER has
  // enough data yet, not just the older of the two.
  const hasDecisionData = stats.appliedVsSkipped.applied + stats.appliedVsSkipped.skipped >= 3;

  if (!stats.hasEnoughData && !hasDecisionData) {
    return (
      <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <div className="mb-1 flex items-center gap-3">
          <span className="signal-icon-chip">
          <TrendingUp className="h-4 w-4" />
        </span>
          <h2 className="text-base font-semibold text-text-primary">Outcome Insights</h2>
        </div>
        <p className="mt-3 text-sm text-text-muted">
          Track a few more applications and this section will show real patterns from your own history — interview
          rate by match score and grade, applied vs. skipped, and your most common rejection reasons.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <span className="signal-icon-chip">
          <TrendingUp className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-text-primary">Outcome Insights</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Real patterns from your own tracked applications — never a market benchmark, just what&apos;s actually
        happened for you.
      </p>

      <div className="grid gap-6 sm:grid-cols-2">
        {stats.byMatchBand.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Interview rate by match score
            </h3>
            <div className="flex flex-col gap-2.5">
              {stats.byMatchBand.map((stat) => (
                <RateBar key={stat.band} label={stat.band} applied={stat.applied} interviewed={stat.interviewed} rate={stat.rate} />
              ))}
            </div>
          </div>
        )}

        {stats.byGrade.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Interview rate by evaluation grade
            </h3>
            <div className="flex flex-col gap-2.5">
              {stats.byGrade.map((stat) => (
                <RateBar
                  key={stat.grade}
                  label={`Grade ${stat.grade}`}
                  applied={stat.applied}
                  interviewed={stat.interviewed}
                  rate={stat.rate}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {stats.rejectionReasons.length > 0 && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Top rejection reasons</h3>
          <ul className="flex flex-col gap-1.5">
            {stats.rejectionReasons.map((stat) => (
              <li key={stat.category} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{CATEGORY_LABELS[stat.category]}</span>
                <span className="font-medium text-text-primary">
                  {stat.count} rejection{stat.count === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Q3 fast-follow (build-plan.md §Q3) — "did you apply, or skip and
          why". Only rendered once there's enough real decision data to be
          a pattern rather than noise (same MIN_SAMPLE_SIZE=3 discipline as
          every other stat here), separate from hasEnoughData above since
          job_decisions is a newer table and fills in gradually. */}
      {hasDecisionData && (
        <div className="mt-6 border-t border-border pt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Applied vs. skipped</h3>
          <p className="mb-3 text-sm text-text-secondary">
            {stats.appliedVsSkipped.applied} applied · {stats.appliedVsSkipped.skipped} skipped
          </p>
          {stats.skipReasons.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {stats.skipReasons.map((stat) => (
                <li key={stat.reason} className="flex items-center justify-between text-sm">
                  <span className="text-text-secondary">{stat.reason}</span>
                  <span className="font-medium text-text-primary">
                    {stat.count} time{stat.count === 1 ? "" : "s"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {stats.hasEnoughData && (
      <div className="mt-5 border-t border-border pt-4">
        {narrative ? (
          <AiReadsCard>
            <ul className="flex flex-col gap-1">
              {narrative.observations.map((observation, i) => (
                <li key={i} className="text-sm leading-6 text-text-primary">
                  {observation}
                </li>
              ))}
            </ul>
          </AiReadsCard>
        ) : isPending ? (
          <AiThinkingCard status="Looking for patterns in your tracked outcomes…" />
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleGenerate}
            className="glass-pill inline-flex min-h-9 items-center gap-2 px-4 py-2 text-sm font-medium text-text-secondary transition-colors disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {isPending ? "Reading your history..." : "Get an AI summary of these patterns"}
          </button>
        )}
        {error && <p className="mt-2 text-xs text-error">{error}</p>}
      </div>
      )}
    </section>
  );
}

