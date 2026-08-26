import { TrendingUp } from "lucide-react";

import { buildLinkedInPeopleSearchUrl } from "@/components/shared/NetworkSignals";
import type { HiringSignal } from "@/lib/hiringSignal";
import { AiReadsCard } from "@/components/shared/AiReadsCard";

// Signal-based outreach automation, free half (Phase 18 item 5,
// context/RESUME.md). Only renders on a genuine signal (rising posting
// volume for this exact company, real counts from lib/hiringSignal.ts) —
// never shows a fabricated "buying signal" the way a paid Clay/Apollo feed
// might. Pairs the signal with the same free LinkedIn people-search deep
// link NetworkSignals already uses, rather than inventing a new outreach
// mechanism.
//
// Upgraded to AiReadsCard (2026-08-25, direct user report — Company tab
// still not "up to par" with the rest of the redesign) — was a flat
// bg-agent-light/40 wash, the same "strap" pattern already fixed
// everywhere else on this page. Label reads "Hiring signal", not "AI
// Navigator reads" — this is a real deterministic count, not an LLM call —
// but it already used agent-teal (this app's own smart-signal tone), so it
// earns the same real depth (gradient + glow) other agent-teal reads get.
export function OutreachSignal({ company, signal }: { company: string; signal: HiringSignal | null }) {
  if (!signal?.trending) return null;

  return (
    <AiReadsCard label="Hiring signal">
      <p className="text-sm leading-6 text-text-primary">
        Sortie has seen {signal.recentCount} postings from {company} in the last 30 days
        {signal.priorCount > 0 ? `, up from ${signal.priorCount} the 30 days before` : ""} — real, rising hiring activity, a good moment to reach
        out directly instead of just applying and waiting.
      </p>
      <a
        href={buildLinkedInPeopleSearchUrl(company)}
        target="_blank"
        rel="noreferrer noopener"
        className="btn-signal mt-3 inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground"
      >
        <TrendingUp className="h-4 w-4" />
        Find people at {company} on LinkedIn
      </a>
    </AiReadsCard>
  );
}
