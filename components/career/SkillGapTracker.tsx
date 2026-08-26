"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles, Target } from "lucide-react";

import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { getSkillGaps, generateSkillGapPathingAction } from "@/actions/skillGapTracking";
import type { SkillGap, SkillGapPathingResult } from "@/lib/skillGapTracking";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

// Skill-gap tracking & career pathing (build-plan.md §E). Same
// aggregate-real-data-then-one-synthesis-call shape as MarketReadiness.tsx.
export function SkillGapTracker() {
  const [gaps, setGaps] = useState<SkillGap[] | null>(null);
  const [jobCount, setJobCount] = useState(0);
  const [pathing, setPathing] = useState<SkillGapPathingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getSkillGaps().then((result) => {
      if (result.success) {
        setGaps(result.gaps);
        setJobCount(result.jobCount);
      }
    });
  }, []);

  function handleSynthesize(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateSkillGapPathingAction();
      if (result.success) setPathing(result.result);
      else setError(result.error);
    });
  }

  if (gaps !== null && gaps.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <span className="signal-icon-chip">
          <Target className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-text-primary">Recurring Skill Gaps</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        Skills that keep showing up as missing across your own evaluated jobs — a real pattern from {jobCount} of
        your own postings, not a generic list.
      </p>

      {gaps === null ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {gaps.map((gap) => (
            <span
              key={gap.skill}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-secondary"
            >
              {gap.skill}
              <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">{gap.count}</span>
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        disabled={isPending || !gaps || gaps.length === 0}
        onClick={handleSynthesize}
        className="btn-signal mt-4 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending ? "Thinking..." : pathing ? "Get another read" : "What should I do about this?"}
      </button>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && (
        <AiThinkingCard className="mt-4" status="Comparing gaps across your evaluated jobs…" />
      )}

      {pathing && (
        <AiReadsCard className="mt-4">
          <div className="flex flex-col gap-2">
            {pathing.observations.map((obs, i) => (
              <p key={i} className="text-sm leading-6 text-text-primary">
                {obs}
              </p>
            ))}
          </div>
        </AiReadsCard>
      )}
    </section>
  );
}
