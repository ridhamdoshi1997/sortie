"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarCheck, Sparkles } from "lucide-react";

import { generateNinetyDayPlanAction } from "@/actions/jobs";
import type { Job } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

function PlanColumn({ label, items, index = 0 }: { label: string; items: string[]; index?: number }) {
  return (
    <div className="dim-card-in" style={{ animationDelay: `${index * 60}ms` }}>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-agent-dark">{label}</p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm leading-6 text-text-primary">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-agent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// First-90-days success plan (build-plan.md §F) — same "AI Navigator
// reads" shell as NegotiationScript.tsx/LeverageSynthesizer.tsx.
export function NinetyDayPlan({ jobId, plan }: { jobId: string; plan: Job["ninety_day_plan"] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await generateNinetyDayPlanAction(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate a 90-day plan.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">First 90 Days</h2>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Planning..." : plan ? "Regenerate plan" : "Build my 90-day plan"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && (
        <AiThinkingCard className="mt-4" status="Building your 90-day plan…" />
      )}

      {plan ? (
        <AiReadsCard className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <PlanColumn index={0} label="Day 1-30" items={plan.day30} />
            <PlanColumn index={1} label="Day 31-60" items={plan.day60} />
            <PlanColumn index={2} label="Day 61-90" items={plan.day90} />
          </div>
          {plan.watchOuts.length > 0 && (
            <div className="border-t border-agent-dark/10 pt-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-agent-dark">Watch out for</p>
              <ul className="flex flex-col gap-1.5">
                {plan.watchOuts.map((item, i) => (
                  <li key={i} className="text-sm leading-6 text-text-primary">
                    • {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AiReadsCard>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            A deliberate 30/60/90-day ramp plan grounded in this role&apos;s real responsibilities — not generic onboarding advice.
          </p>
        )
      )}
    </section>
  );
}
