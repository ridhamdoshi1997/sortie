import { TrendingUp } from "lucide-react";

import { buildLinkedInPeopleSearchUrl } from "@/components/shared/NetworkSignals";
import type { HiringSignal } from "@/lib/hiringSignal";

// Signal-based outreach automation, free half (Phase 18 item 5,
// context/RESUME.md). Only renders on a genuine signal (rising posting
// volume for this exact company, real counts from lib/hiringSignal.ts) —
// never shows a fabricated "buying signal" the way a paid Clay/Apollo feed
// might. Pairs the signal with the same free LinkedIn people-search deep
// link NetworkSignals already uses, rather than inventing a new outreach
// mechanism.
export function OutreachSignal({ company, signal }: { company: string; signal: HiringSignal | null }) {
  if (!signal?.trending) return null;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-agent/30 bg-agent-light/40 p-6">
      <div className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-agent-dark" />
        <h3 className="text-sm font-semibold text-agent-dark">Hiring signal</h3>
      </div>
      <p className="text-sm leading-6 text-text-secondary">
        Sortie has seen {signal.recentCount} postings from {company} in the last 30 days
        {signal.priorCount > 0 ? `, up from ${signal.priorCount} the 30 days before` : ""} — real, rising hiring activity, a good moment to reach
        out directly instead of just applying and waiting.
      </p>
      <a
        href={buildLinkedInPeopleSearchUrl(company)}
        target="_blank"
        rel="noreferrer noopener"
        className="inline-flex w-fit items-center gap-2 rounded-lg border border-agent/40 bg-surface px-4 py-2 text-sm font-medium text-agent-dark transition-opacity hover:opacity-90"
      >
        Find people at {company} on LinkedIn
      </a>
    </section>
  );
}
