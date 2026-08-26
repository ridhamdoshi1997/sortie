"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessageSquareQuote, Sparkles } from "lucide-react";

import { synthesizeLeverage } from "@/actions/jobs";
import { LEVERAGE_LABELS, type LeverageLevel } from "@/lib/leverageSynthesizer";
import type { Job } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

type Props = {
  jobId: string;
  synthesis: Job["leverage_synthesis"];
};

const LEVEL_CLASSES: Record<LeverageLevel, string> = {
  strong: "bg-success-lightest text-success-foreground",
  moderate: "bg-agent-light text-agent-dark",
  limited: "bg-warning/15 text-warning",
  unclear: "bg-surface-secondary text-text-muted",
};

// Post-Offer Leverage Synthesizer — same honesty-scoped shape as
// StrategicMoatBriefing.tsx/lib/rejectionIntelligence.ts's UI: opt-in,
// button-triggered, and the AI output gets the exact "AI Navigator reads" treatment
// from ui-rules.md's Agent Content section (border-agent/bg-agent-light/
// text-agent-dark) — never reused for the Equity Decoder's plain form above,
// which is user input, not AI content.
export function LeverageSynthesizer({ jobId, synthesis }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await synthesizeLeverage(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate a leverage synthesis.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Post-Offer Leverage Synthesizer
          </h2>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Synthesizing..." : synthesis ? "Refresh synthesis" : "Synthesize my leverage"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && <AiThinkingCard className="mt-4" status="Weighing your leverage factors…" />}

      {!isPending && synthesis ? (
        <AiReadsCard
          className="mt-4"
          meta={
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${LEVEL_CLASSES[synthesis.leverageLevel]}`}>
              {LEVERAGE_LABELS[synthesis.leverageLevel]}
            </span>
          }
        >
          <ul className="flex flex-col gap-2">
            {synthesis.factors.map((factor, i) => (
              <li key={i} className="text-sm leading-6 text-text-primary">
                <span className="font-semibold">{factor.label}:</span> {factor.explanation}
              </li>
            ))}
          </ul>

          {synthesis.talkingPoints.length > 0 && (
            <div className="mt-3 border-t border-agent-dark/10 pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-agent-dark">Talking points</p>
              <ul className="flex flex-col gap-1.5">
                {synthesis.talkingPoints.map((point, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-6 text-text-primary">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-agent" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-3 text-xs italic text-text-muted">{synthesis.confidenceNote}</p>
        </AiReadsCard>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            A read on how much negotiating room you likely have, grounded only in this job&apos;s own stored fit data,
            timing, and history — never a fabricated market benchmark.
          </p>
        )
      )}
    </section>
  );
}
