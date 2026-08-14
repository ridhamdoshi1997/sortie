"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";

import { getTrapDoorPredictions } from "@/actions/jobs";
import { TRAP_DOOR_CATEGORY_LABELS } from "@/lib/trapDoorPredictor";
import type { Job } from "@/types";

type Props = {
  jobId: string;
  predictions: Job["trap_door_predictions"];
};

// Same opt-in button-triggered shape as StrategicMoatBriefing.tsx — this
// call is free-tier Gemini only (no Perplexity fallback, unlike the moat
// briefing), but still usage-gated like every other AI action here.
export function TrapDoorPredictor({ jobId, predictions }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await getTrapDoorPredictions(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate predictions.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-error" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Trap Door Predictor
          </h2>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Predicting..." : predictions ? "Refresh" : "Predict trap doors"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {predictions ? (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-r-lg border-l-2 border-error bg-error/10 px-4 py-3">
            <p className="text-xs text-error">{predictions.confidenceNote}</p>
          </div>
          {predictions.predictions.map((p, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface-secondary p-4">
              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-muted">
                {TRAP_DOOR_CATEGORY_LABELS[p.category]}
              </span>
              <p className="mt-1.5 text-sm font-medium leading-6 text-text-primary">{p.question}</p>
              <p className="mt-1.5 text-xs text-text-muted">{p.whyLikely}</p>
            </div>
          ))}
        </div>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            Predicted tough questions grounded in this company&apos;s own stored risk signals — not
            real leaked questions.
          </p>
        )
      )}
    </section>
  );
}
