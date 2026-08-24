"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles, Target } from "lucide-react";

import { getSkillGaps, generateSkillGapPathingAction } from "@/actions/skillGapTracking";
import type { SkillGap, SkillGapPathingResult } from "@/lib/skillGapTracking";

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
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <Target className="h-4 w-4 text-text-secondary" />
        </div>
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
        className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending ? "Thinking..." : pathing ? "Get another read" : "What should I do about this?"}
      </button>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {pathing && (
        <div className="mt-4 rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3">
          <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">AI Navigator reads</p>
          <div className="flex flex-col gap-2">
            {pathing.observations.map((obs, i) => (
              <p key={i} className="text-sm leading-6 text-agent-dark">
                {obs}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
