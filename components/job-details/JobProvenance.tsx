import { Clock, Layers, Users } from "lucide-react";

import { formatPostedAge, formatSourceLabel } from "@/lib/jobFreshness";

// Real, scraped facts about the LISTING itself — none of it AI-derived, so
// this card is fully populated the moment a job is found, with or without an
// evaluation. That is the point of it: the Overview tab used to be entirely
// AI-dependent, and a job whose evaluation had not run (or could not run, on
// an exhausted quota) showed empty section headers over a wall of raw
// description.
//
// Deliberately does NOT repeat salary / location / type / found — those are
// the sticky JobIdentityRail's job.
//
// Deliberately does NOT state where the apply link points (direct user
// call, 2026-09-04): the Apply button already goes there, so "Applications
// go to ca.linkedin.com" spent a whole sentence telling the reader
// something the very next click would show them. A fact is only worth a row
// here if it changes what the reader DOES.
//
// What survives that bar is recency. Application timing is the one thing a
// candidate can still act on before any AI has run, and it is the one thing
// a raw description never tells them.

export type JobSourceRecord = {
  source_type: string;
  discovered_at?: string | null;
};

type Props = {
  postedAt: string | null | undefined;
  sources: JobSourceRecord[];
  /** LinkedIn's own competition signal, e.g. "52 applicants". */
  applicantCount?: string | null;
  /** LinkedIn's stated seniority band, e.g. "Mid-Senior level". */
  experienceLevel?: string | null;
};

// The recency meter's window. 30 days matches formatPostedAge's own switch
// to months, so the bar empties exactly as the label stops counting days.
const RECENCY_WINDOW_DAYS = 30;

function recencyRatio(postedAt: string): number | null {
  const ts = Date.parse(postedAt);
  if (Number.isNaN(ts)) return null;
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 0) return null;
  return Math.max(0, Math.min(1, 1 - days / RECENCY_WINDOW_DAYS));
}

export function JobProvenance({ postedAt, sources, applicantCount, experienceLevel }: Props) {
  const age = postedAt ? formatPostedAge(postedAt) : null;
  const ratio = postedAt ? recencyRatio(postedAt) : null;

  const unique = [
    ...new Set(
      [...sources]
        .sort((a, b) => Date.parse(a.discovered_at ?? "") - Date.parse(b.discovered_at ?? "") || 0)
        .map((source) => formatSourceLabel(source.source_type)),
    ),
  ];

  // A single source is not a fact worth a row — every listing has at least
  // one. Corroboration only becomes information at two or more.
  const corroborated = unique.length > 1;

  if (!age && !corroborated && !applicantCount && !experienceLevel) return null;

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-card">
      <h2 className="text-sm font-semibold leading-5 text-text-primary">Listing facts</h2>

      {age && ratio !== null && (
        <div className="mt-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-medium leading-6 text-text-primary">
              <Clock className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              Posted {age.label}
            </span>
            {age.isFresh && (
              <span className="rounded-full bg-agent-light px-2.5 py-0.5 font-mono text-[11px] font-semibold text-agent-dark">
                Fresh
              </span>
            )}
          </div>

          {/* Determinate on purpose, and honestly so: this is a real measured
              age against a real fixed window, not a synthetic ticking number
              — the exact distinction SignalLoaders.tsx draws between
              SignalProgressBar and AiThinkingCard. .signal-fill-in is the
              right animation here because the value is fixed at render (see
              that class's own note); it fills once on arrival rather than
              transitioning as a live value changes. */}
          <div
            className="signal-meter-track mt-2 w-full"
            role="img"
            aria-label={`Posted ${age.label}, within a ${RECENCY_WINDOW_DAYS}-day recency window`}
          >
            <div
              className="signal-meter-fill signal-fill-in"
              style={{ "--fill": ratio } as React.CSSProperties}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[10.5px] uppercase tracking-wide text-text-muted">
            <span>Just posted</span>
            <span>{RECENCY_WINDOW_DAYS}+ days</span>
          </div>
        </div>
      )}

      {(corroborated || applicantCount || experienceLevel) && (
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border-light pt-4">
          {corroborated && (
            <span className="inline-flex flex-wrap items-center gap-2 text-[13px] leading-6 text-text-secondary">
              <Layers className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              Listed independently by {unique.length} sources
              <span className="flex flex-wrap gap-1.5">
                {unique.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-surface-secondary px-2 py-0.5 text-[11px] font-medium text-text-primary"
                  >
                    {name}
                  </span>
                ))}
              </span>
            </span>
          )}
          {/* Rendered verbatim — LinkedIn phrases this either as a count
              ("52 applicants") or as a range cue ("Be among the first 25
              applicants"); rewriting it would risk changing its meaning. */}
          {applicantCount && (
            <span className="inline-flex items-center gap-2 text-[13px] leading-6 text-text-secondary">
              <Users className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              {applicantCount}
            </span>
          )}
          {experienceLevel && (
            <span className="inline-flex items-center gap-2 text-[13px] leading-6 text-text-secondary">
              <Layers className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              {experienceLevel}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
