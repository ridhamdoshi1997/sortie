"use client";

import { useMemo } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";

import { analyzeCoverLetterATS } from "@/lib/atsChecker";
import type { ResumeStyle } from "@/types/resumeEditor";

type Props = {
  style: ResumeStyle;
  letterBody: string;
  salutation: string | null;
  company: string | null;
};

function scoreTone(score: number): { badge: string; label: string } {
  if (score >= 80) return { badge: "bg-agent text-agent-foreground", label: "ATS-safe" };
  if (score >= 60) return { badge: "bg-warning/15 text-warning", label: "Some risk" };
  return { badge: "bg-error/10 text-error", label: "High risk" };
}

// Same zero-cost, always-live pattern as ATSAuditCard.tsx (résumé version)
// — see lib/atsChecker.ts's analyzeCoverLetterATS header comment for why
// this is fully deterministic (word count, company mention, salutation,
// layout) rather than reusing that component's AI-derived keyword score,
// which has no cover-letter equivalent to reuse.
export function CoverLetterATSAuditCard({ style, letterBody, salutation, company }: Props) {
  const result = useMemo(
    () => analyzeCoverLetterATS(style, letterBody, salutation, company),
    [style, letterBody, salutation, company],
  );

  if (result.wordCount === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-secondary p-4 text-center">
        <p className="text-xs text-text-muted">Write your letter to see its ATS compatibility score.</p>
      </div>
    );
  }

  const tone = scoreTone(result.overallScore);

  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${tone.badge}`}>
            {result.overallScore}
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">{tone.label}</p>
            <p className="text-[11px] text-text-muted">ATS compatibility score · {result.wordCount} words</p>
          </div>
        </div>
        {result.issues.length === 0 ? (
          <ShieldCheck className="h-4 w-4 text-agent" />
        ) : (
          <span className="flex items-center gap-1 text-[11px] font-medium text-warning">
            <AlertTriangle className="h-3.5 w-3.5" />
            {result.issues.length} issue{result.issues.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {result.issues.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {result.issues.map((issue) => (
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
    </div>
  );
}
