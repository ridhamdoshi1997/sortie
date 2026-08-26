"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Compass, ShieldAlert, Sparkles } from "lucide-react";

import { getStrategicMoatBriefing } from "@/actions/jobs";
import type { Job } from "@/types";
import { AiThinkingCard } from "@/components/ui/SignalLoaders";

type Props = {
  jobId: string;
  briefing: Job["strategic_moat"];
};

function ListSection({
  title,
  items,
  icon: Icon,
  variant,
  index = 0,
}: {
  title: string;
  items: string[];
  icon: typeof Compass;
  variant: "accent" | "error";
  index?: number;
}) {
  if (items.length === 0) return null;

  return (
    <div
      className="dim-card-in rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-agent/25"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="mb-3 flex items-center gap-2">
        <div
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            variant === "error" ? "bg-error/10 text-error" : "bg-accent-muted text-accent"
          }`}
        >
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold leading-5 text-text-primary">{title}</h3>
      </div>
      <ul className="space-y-2 text-sm font-medium leading-6 text-text-primary">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Opt-in, button-triggered (not auto-loaded like CompanyResearchAutoLoader)
// — this can fall to a real-$ Perplexity call (see researchStrategicMoat's
// comment), same principle as every other opt-in paid action in this app.
export function StrategicMoatBriefing({ jobId, briefing }: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await getStrategicMoatBriefing(jobId);
      if (!result.success) {
        setError(result.error ?? "Could not generate a strategic briefing.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
          Strategic Moat Briefing
        </h2>
        <button
          type="button"
          disabled={isPending}
          onClick={handleClick}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
        >
          <Sparkles className="h-4 w-4" />
          {isPending ? "Researching..." : briefing ? "Refresh briefing" : "Get strategic briefing"}
        </button>
      </div>

      {error && <p className="mt-3 text-xs text-error">{error}</p>}

      {isPending && <AiThinkingCard className="mt-4" status="Researching strategic priorities and threats…" />}

      {!isPending && briefing ? (
        <div className="mt-4 flex flex-col gap-3">
          <ListSection
            index={0}
            title="Strategic priorities"
            items={briefing.strategicPriorities}
            icon={Compass}
            variant="accent"
          />
          <ListSection
            index={1}
            title="Existential threats"
            items={briefing.existentialThreats}
            icon={ShieldAlert}
            variant="error"
          />
          <ListSection
            index={2}
            title="Sharp questions to ask"
            items={briefing.smartQuestions}
            icon={Sparkles}
            variant="accent"
          />
          {briefing.sources.length > 0 && (
            <p className="text-xs text-text-muted">
              Sources: {briefing.sources.slice(0, 3).join(", ")}
            </p>
          )}
        </div>
      ) : (
        !isPending && (
          <p className="mt-3 text-sm text-text-muted">
            Recent news, current strategic priorities, and existential threats — grounded in real
            search results, not generic industry filler.
          </p>
        )
      )}
    </section>
  );
}
