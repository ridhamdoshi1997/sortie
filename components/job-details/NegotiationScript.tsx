"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { MessagesSquare, Sparkles } from "lucide-react";

import { generateNegotiationScript } from "@/actions/jobs";
import type { Job } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

// Negotiation scripts (build-plan.md §F, Phase 12) — same honesty-scoped
// "AI Navigator reads" treatment as LeverageSynthesizer.tsx, since this is
// genuinely AI-drafted content built from that synthesis, not a plain form.
// Auto-chains a leverage synthesis internally if one doesn't exist yet
// (actions/jobs.ts's generateNegotiationScript) — the button here works
// even before LeverageSynthesizer above it has ever been clicked.
export function NegotiationScript({ jobId, script }: { jobId: string; script: Job["negotiation_script"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateNegotiationScript(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate a negotiation script.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Negotiation Script
          </h2>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Drafting..." : script ? "Regenerate script" : "Draft my script"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && (
        <AiThinkingCard className="mt-4" status="Drafting from your leverage synthesis…" />
      )}

      {script ? (
        <AiReadsCard className="mt-4">

          <div className="mt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-agent-dark">Opening ask</p>
            <p className="text-sm leading-6 text-text-primary">{script.openingAsk}</p>
          </div>

          {script.counterResponses.length > 0 && (
            <div className="mt-3 border-t border-agent-dark/10 pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-agent-dark">If they push back</p>
              <div className="flex flex-col gap-2.5">
                {script.counterResponses.map((cr, i) => (
                  <div key={i} className="rounded-lg bg-surface/40 p-2.5">
                    <p className="text-xs italic text-text-secondary">&quot;{cr.theirPushback}&quot;</p>
                    <p className="mt-1 text-sm leading-6 text-text-primary">{cr.yourResponse}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-3 border-t border-agent-dark/10 pt-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-agent-dark">Closing line</p>
            <p className="text-sm leading-6 text-text-primary">{script.closingLine}</p>
          </div>
        </AiReadsCard>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            Turns your leverage synthesis into actual words to say — an opening ask, responses to pushback, and how
            to close the conversation gracefully either way.
          </p>
        )
      )}
    </section>
  );
}
