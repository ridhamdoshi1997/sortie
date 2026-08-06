"use client";

import { Loader2, RefreshCw } from "lucide-react";

import type { ResumeAnalysis } from "@/types";

const GRADE_BADGE: Record<ResumeAnalysis["grade"], string> = {
  A: "bg-agent text-agent-foreground",
  B: "bg-agent-light text-agent-dark",
  C: "bg-surface-secondary text-text-secondary",
  D: "bg-warning/10 text-warning",
  F: "bg-error text-error-foreground",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

type Props = {
  analysis: ResumeAnalysis | null;
  analyzedAt: string | null;
  analyzing: boolean;
  onRefresh: () => void;
};

// The whole-résumé 10-dimension quality grade — a different, much more
// expensive analysis than the job-fit gauge above it (3/day cap vs. the
// fit-check's 15/day), so this deliberately does NOT auto-refresh on every
// edit. It shows the last-computed grade with an explicit refresh action,
// and is only ever auto-triggered by ResumeWorkspace after a full
// Regenerate — never by a small section tweak.
export function QualityGradeCard({ analysis, analyzedAt, analyzing, onRefresh }: Props) {
  if (!analysis) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface-secondary p-4 text-center">
        <p className="text-xs text-text-muted">
          {analyzing ? "Grading this résumé…" : "No full quality grade yet — 10-dimension rubric, narrative fit, and interviewer-skepticism check."}
        </p>
        {!analyzing && (
          <button
            type="button"
            onClick={onRefresh}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            <RefreshCw className="h-3 w-3" />
            Get full quality grade
          </button>
        )}
        {analyzing && <Loader2 className="mx-auto mt-2 h-4 w-4 animate-spin text-text-muted" />}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-surface-secondary p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ${GRADE_BADGE[analysis.grade]}`}>
            {analysis.grade}
          </span>
          <div>
            <p className="text-sm font-medium text-text-primary">{analysis.gradeLabel}</p>
            <p className="text-[11px] text-text-muted">
              {analysis.urgentCount > 0 && `${analysis.urgentCount} urgent · `}
              {analysis.criticalCount} critical · {analysis.optionalCount} optional
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={analyzing}
          onClick={onRefresh}
          className="rounded-md p-1.5 text-text-muted hover:text-accent disabled:opacity-50"
          aria-label="Refresh quality grade"
        >
          {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {analysis.dimensions.map((d) => (
          <div key={d.dimension} className="flex items-center gap-1.5">
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded font-mono text-[9px] font-bold ${GRADE_BADGE[d.grade]}`}
            >
              {d.grade}
            </span>
            <span className="truncate text-[11px] text-text-secondary" title={d.dimension}>
              {d.dimension}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-3 font-mono text-[10px] text-text-muted">Analyzed {formatRelative(analyzedAt)}</p>
    </div>
  );
}
