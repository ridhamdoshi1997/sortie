import { Sparkles } from "lucide-react";

import type { WeeklyWin } from "@/lib/careerTimeline";

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short" });
}

// "Weekly Wins" ticker (build-plan.md §P) — a small recap widget, not a
// dashboard. Deliberately quiet/plain when there's nothing to show this
// week rather than an empty-feeling card — most weeks won't have anything
// logged, and that's fine, this isn't meant to nag.
export function WeeklyWinsTicker({ wins }: { wins: WeeklyWin[] }) {
  if (wins.length === 0) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success-lightest">
          <Sparkles className="h-4 w-4 text-success" />
        </div>
        <h2 className="text-base font-semibold text-text-primary">This week&apos;s wins</h2>
      </div>
      <ul className="flex flex-col gap-2">
        {wins.map((win) => (
          <li key={win.id} className="flex items-baseline gap-2 text-sm">
            <span className="font-mono text-xs uppercase text-text-muted">{formatDay(win.loggedAt)}</span>
            <span className="text-text-primary">{win.title}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
