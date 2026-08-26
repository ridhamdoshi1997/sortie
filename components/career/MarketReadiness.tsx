"use client";

import { useState, useTransition } from "react";
import { Compass, Sparkles } from "lucide-react";

import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { generateMarketReadinessAction } from "@/actions/marketReadiness";
import type { MarketReadinessResult } from "@/lib/marketReadiness";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

// The free pivot of build-plan.md §E's "Passive market-watch" (agy's own
// rescope — real ongoing job-ingestion for a passive user is a genuinely
// different, expensive pipeline; this reads only data already on hand).
// Same opt-in/never-eager shape as BragDocGenerator.tsx.
export function MarketReadiness() {
  const [result, setResult] = useState<MarketReadinessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, startTransition] = useTransition();

  function handleCheck(): void {
    setError(null);
    startTransition(async () => {
      const response = await generateMarketReadinessAction();
      if (!response.success) {
        setError(response.error);
        return;
      }
      setResult(response.result);
    });
  }

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-1 flex items-center gap-3">
        <span className="signal-icon-chip">
          <Compass className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold text-text-primary">Market Readiness</h2>
      </div>
      <p className="mb-4 mt-1 text-sm text-text-secondary">
        A read on how your recent logged work compares to the roles you say you&apos;re targeting — using only your
        own data, whether or not you&apos;re actively searching.
      </p>

      <button
        type="button"
        disabled={isChecking}
        onClick={handleCheck}
        className="btn-signal inline-flex h-10 items-center gap-1.5 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {isChecking ? "Checking..." : result ? "Check again" : "Check my market readiness"}
      </button>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isChecking && (
        <AiThinkingCard className="mt-4" status="Comparing your logged work to your target roles…" />
      )}

      {result && (
        <AiReadsCard className="mt-4">
          <div className="flex flex-col gap-2">
            {result.observations.map((obs, i) => (
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
