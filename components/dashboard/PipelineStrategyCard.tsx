"use client";

import { useEffect, useState, useTransition } from "react";
import { Sparkles, Target } from "lucide-react";

import { getPipelineSnapshot, generatePipelineStrategyReadAction } from "@/actions/pipelineStrategy";
import type { PipelineSnapshot, PipelineStrategyResult } from "@/lib/pipelineStrategy";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

// Pipeline Strategy Read (build-plan.md §H, "AI heavy dashboard" direct
// request) — same aggregate-real-data-then-one-synthesis-call shape as
// SkillGapTracker.tsx/MarketReadiness.tsx, applied to data those widgets
// don't look at (the CURRENT funnel snapshot + per-stage match score, not
// historical patterns).
export function PipelineStrategyCard() {
  const [snapshot, setSnapshot] = useState<PipelineSnapshot | null>(null);
  const [read, setRead] = useState<PipelineStrategyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getPipelineSnapshot().then((result) => {
      if (result.success) setSnapshot(result.snapshot);
    });
  }, []);

  function handleGenerate(): void {
    setError(null);
    startTransition(async () => {
      const result = await generatePipelineStrategyReadAction();
      if (result.success) setRead(result.result);
      else setError(result.error);
    });
  }

  const nonEmptyStages = snapshot?.stages.filter((s) => s.count > 0) ?? [];
  if (snapshot !== null && nonEmptyStages.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-secondary">
          <Target className="h-4 w-4 text-text-secondary" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">Pipeline Strategy Read</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        A real strategic read on where your jobs sit right now and whether your strongest matches are
        actually getting acted on.
      </p>

      {snapshot === null ? (
        <p className="text-xs text-text-muted">Loading…</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {nonEmptyStages.map((s) => (
            <span
              key={s.stage}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-secondary px-3 py-1.5 text-sm font-medium text-text-secondary"
            >
              {s.label}
              <span className="rounded-full bg-info/15 px-1.5 py-0.5 text-[10px] font-semibold text-info">
                {s.count}
                {s.avgMatchScore !== null ? ` · avg ${s.avgMatchScore}` : ""}
              </span>
            </span>
          ))}
          {snapshot.highMatchShortlistedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1.5 text-sm font-medium text-warning">
              {snapshot.highMatchShortlistedCount} strong match{snapshot.highMatchShortlistedCount === 1 ? "" : "es"} untouched in
              Shortlisted
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={isPending || !snapshot || snapshot.totalActive === 0}
        onClick={handleGenerate}
        className="btn-signal mt-4 inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isPending ? "Thinking..." : read ? "Get another read" : "Get a strategy read"}
      </button>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && (
        <AiThinkingCard className="mt-4" status="Reading your pipeline snapshot…" />
      )}

      {read && (
        <AiReadsCard className="mt-4">
          <div className="flex flex-col gap-2">
            {read.observations.map((obs, i) => (
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
