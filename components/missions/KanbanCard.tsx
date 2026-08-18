"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, DollarSign, ExternalLink, GripVertical, Home, Loader2, MapPin, Sparkles, Star } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import { getListingSignal } from "@/lib/jobStatus";
import { getSourceBadge } from "@/lib/jobSource";
import { diagnoseRejection, toggleJobPriority } from "@/actions/jobs";
import { CATEGORY_LABELS, type RejectionReasonCategory } from "@/lib/rejectionIntelligence";
import { formatTimeAgo } from "@/lib/utils";
import type { Job } from "@/types";

export type KanbanJob = Pick<
  Job,
  | "id"
  | "title"
  | "company"
  | "company_logo_url"
  | "location"
  | "salary"
  | "job_type"
  | "source"
  | "is_priority"
  | "match_score"
  | "application_status"
  | "application_status_updated_at"
  | "marked_unavailable_at"
  | "dropped_from_search_at"
  | "found_at"
  | "rejection_diagnosis"
  | "rejection_diagnosed_at"
>;

export function KanbanCard({ job, appliedAt }: { job: KanbanJob; appliedAt?: string | null }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: job.id });
  const signal = job.application_status === "draft" ? getListingSignal(job) : null;
  const [diagnosis, setDiagnosis] = useState(job.rejection_diagnosis);
  const [diagnosisError, setDiagnosisError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isPriority, setIsPriority] = useState(job.is_priority);
  // No structured work-mode field exists in the source data (same caveat
  // already documented on JobActionBar.tsx/the job-details page's own
  // isRemote check) — best-effort text match, shown only for remote since
  // that's the constraint research flagged as actually decision-relevant;
  // silence reads as "unspecified/onsite", not asserted either way.
  const isRemote = /\bremote\b/i.test(`${job.title ?? ""} ${job.location ?? ""}`);
  const sourceBadge = getSourceBadge(job.source);
  // Same hydration-mismatch fix as JobActionBar.tsx's foundAtLabel — a
  // time-relative string computed inline in JSX renders differently at
  // SSR-time vs. client-hydration-time whenever real time crosses a bucket
  // boundary between those two moments.
  const [stageAgeLabel, setStageAgeLabel] = useState<string | null>(null);
  const [appliedAtLabel, setAppliedAtLabel] = useState<string | null>(null);
  useEffect(() => {
    const updatedAt = job.application_status_updated_at;
    if (!updatedAt) return;
    const timer = setTimeout(() => setStageAgeLabel(formatTimeAgo(updatedAt)), 0);
    return () => clearTimeout(timer);
  }, [job.application_status_updated_at]);
  useEffect(() => {
    if (!appliedAt) return;
    const timer = setTimeout(() => setAppliedAtLabel(formatTimeAgo(appliedAt)), 0);
    return () => clearTimeout(timer);
  }, [appliedAt]);

  function handleTogglePriority(): void {
    const next = !isPriority;
    setIsPriority(next);
    startTransition(async () => {
      const result = await toggleJobPriority(job.id, next);
      if (!result.success) setIsPriority(!next);
    });
  }

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function handleDiagnose(): void {
    setDiagnosisError(null);
    startTransition(async () => {
      const result = await diagnoseRejection(job.id);
      if (result.success && result.diagnosis) {
        setDiagnosis(result.diagnosis);
      } else {
        setDiagnosisError(result.error ?? "Failed to generate a diagnosis");
      }
    });
  }

  return (
    // Drag listeners/role live on a dedicated handle below, not this whole
    // card — the card contains real interactive elements (the title link,
    // "Why the silence?" button, "View job" link), and useSortable's
    // `attributes` sets role="button" on whatever it's spread onto. Wrapping
    // the whole card in that produced literally invalid HTML (a <button>
    // nested inside a <button>), confirmed live: the nested button's clicks
    // never fired. Same fix EditorTab.tsx's SortableList already applies
    // for the same reason ("avoiding accidental parent-drag").
    <div ref={setNodeRef} style={style} className="glass-panel flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-card">
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label="Drag to move"
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded p-0.5 text-text-muted hover:text-text-secondary active:cursor-grabbing"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <CompanyLogo company={job.company} logoUrl={job.company_logo_url} size="sm" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/find-jobs/${job.id}`}
            className="block truncate text-sm font-semibold text-text-primary hover:text-accent"
          >
            {job.title ?? "Untitled role"}
          </Link>
          <p className="truncate text-xs text-text-muted">{job.company ?? "Unknown company"}</p>
          {job.location && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[10px] text-text-muted">
              <MapPin className="h-2.5 w-2.5 shrink-0" />
              {job.location}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleTogglePriority}
          disabled={isPending}
          aria-label={isPriority ? "Unstar this application" : "Star this application"}
          aria-pressed={isPriority}
          className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-warning disabled:opacity-60"
        >
          <Star className={`h-4 w-4 ${isPriority ? "fill-warning text-warning" : ""}`} />
        </button>
        {typeof job.match_score === "number" && (
          <span className="shrink-0 rounded-full bg-agent-light px-2 py-0.5 text-[10px] font-semibold text-agent-dark">
            {job.match_score}%
          </span>
        )}
      </div>

      {(job.salary || isRemote || sourceBadge) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {job.salary && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-medium text-text-secondary">
              <DollarSign className="h-2.5 w-2.5" />
              {job.salary}
            </span>
          )}
          {isRemote && (
            <span className="inline-flex items-center gap-1 rounded-full bg-info-lightest px-2 py-0.5 text-[10px] font-medium text-info">
              <Home className="h-2.5 w-2.5" />
              Remote
            </span>
          )}
          {sourceBadge && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${sourceBadge.badgeClassName}`}>
              {job.source === "linkedin" && <LinkedInGlyph className="h-2.5 w-2.5" />}
              {job.source === "indeed" && <PlatformLogo source="indeed" className="h-2.5 w-2.5 rounded-[1.5px]" />}
              {sourceBadge.label}
            </span>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {signal && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              signal.level === "confirmed"
                ? "bg-warning text-warning-foreground"
                : signal.level === "likely"
                  ? "bg-warning/15 text-warning"
                  : "bg-surface-secondary text-text-muted"
            }`}
          >
            <AlertTriangle className="h-3 w-3" />
            {signal.label}
          </span>
        )}
        {stageAgeLabel && (
          <span className="text-[10px] text-text-muted">{stageAgeLabel}</span>
        )}
        {/* Distinct from stageAgeLabel above — that's time in the CURRENT
            stage; this is total time since the original application, which
            genuinely differs once a job has moved past "Applied". Only
            rendered when a real application_events row exists (§Q1) — no
            reliable fallback exists for jobs applied to before that table
            shipped, so the line is simply omitted rather than guessed. */}
        {appliedAtLabel && (
          <span className="text-[10px] text-text-muted">Applied {appliedAtLabel}</span>
        )}
      </div>

      {job.application_status === "rejected" && (
        <div className="border-t border-border pt-2">
          {diagnosis ? (
            <div className="rounded-r-lg border-l-2 border-agent bg-agent-light px-2.5 py-2">
              <p className="mb-1 font-mono text-[9px] font-semibold uppercase tracking-wide text-agent-dark">
                AI Navigator reads
              </p>
              <ul className="flex flex-col gap-1">
                {diagnosis.possibleReasons.map((reason, i) => (
                  <li key={i} className="text-[11px] leading-snug text-agent-dark">
                    <span className="font-semibold">
                      {CATEGORY_LABELS[reason.category as RejectionReasonCategory] ?? reason.category}:
                    </span>{" "}
                    {reason.explanation}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] font-medium leading-snug text-agent-dark">
                Next: {diagnosis.suggestedNextAction}
              </p>
              <p className="mt-1 text-[10px] italic text-agent-dark/70">{diagnosis.confidenceNote}</p>
            </div>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={handleDiagnose}
              className="glass-pill inline-flex min-h-8 w-full items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors disabled:opacity-60"
            >
              {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Why the silence?
            </button>
          )}
          {diagnosisError && <p className="mt-1 text-[10px] text-error">{diagnosisError}</p>}
        </div>
      )}

      <Link
        href={`/find-jobs/${job.id}`}
        className="inline-flex items-center gap-1 self-start text-[11px] font-medium text-text-muted hover:text-accent"
      >
        View job <ExternalLink className="h-3 w-3" />
      </Link>
    </div>
  );
}
