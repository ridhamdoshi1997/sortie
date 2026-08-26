"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Sparkles, Swords } from "lucide-react";

import { getInterrogationPlan } from "@/actions/jobs";
import type { Job } from "@/types";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

type Props = {
  jobId: string;
  plan: Job["interrogation_plan"];
};

// Same opt-in button-triggered shape as StrategicMoatBriefing.tsx/
// TrapDoorPredictor.tsx — the click itself stays manual (no auto-fire on
// mount), but per explicit user direction (2026-08-14) that one click now
// auto-chains whatever's missing rather than blocking on a prerequisite the
// user has to go generate elsewhere first: getInterrogationPlan
// (actions/jobs.ts) auto-generates a Strategic Moat Briefing internally if
// one doesn't exist yet (same free-primary-path cost profile as Company
// Research), so this button is never hard-disabled.
export function InterrogationPlan({ jobId, plan }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await getInterrogationPlan(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate an interrogation plan.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Swords className="h-4 w-4 text-text-secondary" />
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            The Interrogation Plan
          </h2>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Synthesizing..." : plan ? "Refresh plan" : "Build my plan"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && <AiThinkingCard className="mt-4" status="Building your interrogation plan…" />}

      {!isPending && plan ? (
        <div className="mt-4 flex flex-col gap-4">
          {plan.generalQuestions.length > 0 && (
            <div className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                General strategic questions
              </p>
              <ul className="flex flex-col gap-2 text-sm font-medium leading-6 text-text-primary">
                {plan.generalQuestions.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.perInterviewer.map((entry, i) => (
            <div
              key={entry.name}
              className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4"
              style={{ animationDelay: `${Math.min(i + 1, 8) * 40}ms` }}
            >
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
                For {entry.name}
              </p>
              <p className="mb-2 text-xs text-text-muted">{entry.rationale}</p>
              <ul className="flex flex-col gap-2 text-sm font-medium leading-6 text-text-primary">
                {entry.questions.map((q, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{q}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            A ready-to-use script of smart questions to ask them, grounded in the company&apos;s
            strategic priorities and your researched panelists — generates a Strategic Moat Briefing
            automatically first if you haven&apos;t already.
          </p>
        )
      )}
    </section>
  );
}
