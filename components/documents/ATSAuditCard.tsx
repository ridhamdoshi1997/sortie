"use client";

import { useMemo } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { analyzeATSFormatting, computeATSScore } from "@/lib/atsChecker";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type Props = {
  style: ResumeStyle;
  sections: ResumeSection[];
  contact: { email: string | null; phone: string | null; location: string | null };
  matchedKeywords: string[];
  missingKeywords: string[];
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
// "Agent read" treatment, since none of this is AI output.
export function ATSAuditCard({ style, sections, contact, matchedKeywords, missingKeywords }: Props) {
  const result = useMemo(
    () => computeATSScore(analyzeATSFormatting(style, sections, contact), matchedKeywords, missingKeywords),
    [style, sections, contact, matchedKeywords, missingKeywords],
  );

  const tone = scoreTone(result.overallScore);
  const hasKeywordData = matchedKeywords.length + missingKeywords.length > 0;

  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${tone.badge}`}>
            {result.overallScore}
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">{tone.label}</p>
            <p className="text-[11px] text-text-muted">ATS compatibility score</p>
          </div>
        </div>
        {result.formatting.issues.length === 0 ? (
          <ShieldCheck className="h-4 w-4 text-agent" />
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.formatting.issues.length} issue{result.formatting.issues.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {result.formatting.issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {result.formatting.issues.map((issue) => (
            <li
              key={issue.id}
              className={`rounded-lg border-l-2 px-2.5 py-2 text-[11px] leading-snug ${
                issue.severity === "critical" ? "border-error bg-error/5 text-text-primary" : "border-warning bg-warning/5 text-text-primary"
              }`}
            >
              <p className="font-semibold">{issue.title}</p>
              <p className="mt-0.5 text-text-secondary">{issue.description}</p>
              <p className="mt-1 text-text-muted">Fix: {issue.howToFix}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 border-t border-border pt-2.5">
        {hasKeywordData ? (
          <p className="text-[11px] text-text-muted">
            Keyword match: {matchedKeywords.length} of {matchedKeywords.length + missingKeywords.length} for this job
            {missingKeywords.length > 0 && ` — missing: ${missingKeywords.slice(0, 4).join(", ")}`}
          </p>
        ) : (
          <p className="text-[11px] text-text-muted">Check your fit score above to include keyword match in this score.</p>
        )}
      </div>
    </div>
  );
}
