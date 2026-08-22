"use client";

import { useEffect, useState } from "react";
import { Clock, Sparkles } from "lucide-react";

type Props = {
  title: string;
  // Cycled every ~3s if more than one — same staged-text pattern as
  // components/find-jobs/SearchLoadingState.tsx (every line must describe
  // something the app genuinely does in order, never invented steps).
  stages: string[];
  timeEstimate: string;
  usageRemaining?: string;
};

// Real implementation of the "generation progress" card from
// app/preview/page.tsx's DemoGenerationProgress mockup — that card was
// design-only until now (2026-08-21, direct user request to make loading
// states "part of the design of the site," not a one-off). Same visual
// language (pulsing icon, indeterminate bar, status text, honest time
// estimate, optional usage-remaining chip) as the approved mockup, wired
// up as a real reusable component instead of a static demo.
export function GenerationProgress({ title, stages, timeEstimate, usageRemaining }: Props) {
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (stages.length <= 1) return;
    const timer = setInterval(() => {
      setStageIndex((i) => Math.min(i + 1, stages.length - 1));
    }, 3000);
    return () => clearInterval(timer);
  }, [stages.length]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
        {usageRemaining && (
          <span className="rounded-full border border-border px-3 py-1 font-mono text-[11px] text-text-muted">
            {usageRemaining}
          </span>
        )}
      </div>
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-muted text-accent">
          <Sparkles className="h-5 w-5 animate-pulse" />
        </div>
        <div className="w-full max-w-sm">
          <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
            <div className="generation-progress-fill absolute inset-y-0 rounded-full bg-accent" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-text-primary">{stages[stageIndex]}</p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-muted">
            <Clock className="h-3.5 w-3.5" />
            {timeEstimate}
          </p>
        </div>
      </div>
    </div>
  );
}
