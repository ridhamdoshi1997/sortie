"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, ShieldCheck } from "lucide-react";

import { computeMatchRate } from "@/lib/atsMatchRate";
import { AnimatedScoreValue } from "@/components/job-details/AnimatedScoreValue";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type Props = {
  style: ResumeStyle;
  sections: ResumeSection[];
  contact: { email: string | null; phone: string | null; location: string | null };
  matchedKeywords: string[];
  missingKeywords: string[];
  // Shown when there's no keyword data yet — differs by context (a
  // tailored résumé has a fit-score button to point at above this card; a
  // résumé slot has no target job to check against at all, so pointing at
  // a button that doesn't exist there would be its own wrong instruction).
  noKeywordDataHint?: string;
};

function scoreTone(score: number): { badge: string; label: string } {
  if (score >= 80) return { badge: "bg-agent text-agent-foreground", label: "ATS-safe" };
  if (score >= 60) return { badge: "bg-warning/15 text-warning", label: "Some risk" };
  return { badge: "bg-error/10 text-error", label: "High risk" };
}

// Deliberately always-on, no button/usage-cap — see lib/atsChecker.ts's
// header comment for why this is pure computation on data already in the
// workspace (ResumeStyle/ResumeSection[] for formatting, the existing
// score-jump's matchedKeywords/missingKeywords for keyword density), not a
// new AI call. Recomputes live via useMemo on every edit, same as the
// Equity/Tax calculators earlier this project — ordinary card styling, no
// "AI Navigator reads" treatment, since none of this is AI output.
function formatRelative(iso: string | null): string | null {
  if (!iso) return null;
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  return `${hours} hour${hours === 1 ? "" : "s"} ago`;
}

export function ATSAuditCard({
  style,
  sections,
  contact,
  matchedKeywords,
  missingKeywords,
  noKeywordDataHint = "Check your fit score above to include keyword match in this score.",
}: Props) {
  // This card already recomputes automatically via useMemo on every real
  // edit below (style/sections/contact/keywords) — there's nothing stale
  // to fix. `recheckKey` exists purely so the manual "Recheck" button (kept
  // for the same at-a-glance affordance the Quality Grade card has) forces
  // a genuine fresh pass rather than being a decorative no-op.
  const [recheckKey, setRecheckKey] = useState(0);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  // A real result to spin over, not decoration for its own sake — spins for
  // exactly as long as the recheck button's own click affordance needs to
  // read as "something happened," then stops.
  const [spinning, setSpinning] = useState(false);

  // ONE scoring system, shared with the Action Plan.
  //
  // This card used to run its own computeATSScore (formatting 50 + keywords
  // 50) while the Action Plan quoted point values from computeMatchRate's
  // weights (searchability 30 / hard 55 / soft 15). Caught live: the plan
  // promised "+29" for a formatting fix and the card then moved 23 -> 61,
  // a jump of 38. Both numbers were internally correct and the pair was
  // nonsense, which is worse than either being wrong alone. computeMatchRate
  // is now the single source for both, so a predicted delta and the observed
  // delta are the same arithmetic.
  //
  // computeMatchRate also handles the no-keyword-data case itself, reporting
  // searchability on a /100 scale rather than letting a clean résumé cap at
  // 50 and read as "High risk" with no explanation.
  const result = useMemo(
    () => computeMatchRate(style, sections, contact, matchedKeywords, missingKeywords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [style, sections, contact, matchedKeywords, missingKeywords, recheckKey],
  );

  const hasKeywordData = result.hasKeywordData;
  const displayScore = result.matchRate;
  const tone = scoreTone(displayScore);

  function handleRecheck(): void {
    setRecheckKey((k) => k + 1);
    setCheckedAt(new Date().toISOString());
    setSpinning(true);
    setTimeout(() => setSpinning(false), 500);
  }

  return (
    <div className="dim-card-in rounded-xl border border-border bg-surface p-4 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold transition-transform duration-300 ${tone.badge} ${spinning ? "scale-110" : ""}`}
          >
            <AnimatedScoreValue value={displayScore} />
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">{tone.label}</p>
            <p className="text-[11px] text-text-muted">
              {hasKeywordData ? "ATS compatibility score" : "Formatting score — no target job to check keywords against"}
              {checkedAt && ` · checked ${formatRelative(checkedAt)}`}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {result.searchabilityIssues.length === 0 ? (
            <ShieldCheck className="h-4 w-4 text-agent" />
          ) : (
            <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
              <AlertTriangle className="h-3.5 w-3.5" />
              {result.searchabilityIssues.length} issue{result.searchabilityIssues.length === 1 ? "" : "s"}
            </span>
          )}
          <button
            type="button"
            onClick={handleRecheck}
            className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-secondary hover:text-accent"
            aria-label="Recheck ATS score"
            title="Recheck ATS score"
          >
            <RefreshCw className={`h-3.5 w-3.5 transition-transform duration-500 ${spinning ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {/* Score breakdown — added 2026-09-11 after a direct user report:
          "It's giving the ATS score of 75 but no explanation?"

          The card showed a 75 labelled "Some risk", then immediately said
          "No formatting issues found — should parse cleanly through an
          ATS", and buried the actual reason (a 3-of-6 keyword match) in
          muted 11px text at the bottom as a bare fact. So the one prominent
          explanation contradicted the score, and nothing said where the 25
          missing points went.

          The score is three weighted categories. Showing all of them makes
          the number self-explanatory and stops the formatting line from
          reading as a verdict on the whole score. */}
      {hasKeywordData && (
        <div className="mt-3 flex flex-col gap-1.5">
          {result.categories.map((c) => (
            <ScoreBar key={c.key} label={c.label} value={c.earned} max={c.weight} />
          ))}
        </div>
      )}

      {result.searchabilityIssues.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2">
          {result.searchabilityIssues.map((issue, i) => (
            <li
              key={issue.id}
              className={`dim-card-in rounded-lg border-l-2 px-2.5 py-2 text-[11px] leading-snug ${
                issue.severity === "critical" ? "border-error bg-error/5 text-text-primary" : "border-warning bg-warning/5 text-text-primary"
              }`}
              style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
            >
              <p className="font-semibold">{issue.title}</p>
              <p className="mt-0.5 text-text-secondary">{issue.description}</p>
              <p className="mt-1 text-text-muted">Fix: {issue.howToFix}</p>
            </li>
          ))}
        </ul>
      ) : (
        // A bare checkmark icon with no text read as "nothing rendered" —
        // zero formatting issues is a real, positive result worth stating
        // explicitly, not just implying via an icon's absence of a badge.
        // Scoped explicitly to FORMATTING. The old copy ended "This résumé
        // should parse cleanly through an ATS", which reads as a verdict on
        // the whole card and directly contradicted a "Some risk" badge
        // driven entirely by the keyword half.
        <p className="mt-3 rounded-lg border-l-2 border-agent bg-agent/5 px-2.5 py-2 text-[11px] leading-snug text-text-secondary">
          No formatting issues found — single-column layout, standard section headers, and all contact fields
          present. Nothing here will trip up an ATS parser.
          {hasKeywordData && missingKeywords.length > 0 && (
            <span className="mt-1 block text-text-muted">
              The points below 100 are all from keyword match, not formatting.
            </span>
          )}
        </p>
      )}

      <div className="mt-3 border-t border-border pt-2.5">
        {hasKeywordData ? (
          <p className="text-[11px] text-text-muted">
            Keyword match: {matchedKeywords.length} of {matchedKeywords.length + missingKeywords.length} for this job
            {missingKeywords.length > 0 && (
              <>
                {" — add these to lift the score: "}
                <span className="text-text-secondary">{missingKeywords.slice(0, 4).join(", ")}</span>
              </>
            )}
          </p>
        ) : (
          <p className="text-[11px] text-text-muted">{noKeywordDataHint}</p>
        )}
      </div>
    </div>
  );
}

// Two 50-point halves rendered as labelled meters, so the headline number is
// traceable to its parts at a glance rather than being asserted.
function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const tone = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-error";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] text-text-secondary">{label}</span>
        <span className="font-mono text-[11px] text-text-primary">
          {Math.round(value)}/{max}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
