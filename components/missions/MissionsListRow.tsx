"use client";

import Link from "next/link";
import { AlertTriangle, Check, Repeat } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import { getListingSignal } from "@/lib/jobStatus";
import { getSourceBadge } from "@/lib/jobSource";
import { STATUS_CLASSES, STATUS_LABELS } from "@/lib/applicationStatus";
import type { ReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

function scoreTierClass(score: number) {
  if (score >= 80) return "text-agent-dark";
  if (score >= 60) return "text-text-primary";
  return "text-text-muted";
}

// Missions List row — the Signal mockup's own `.job-row.track` inside a
// `.signal-rail` (page-missions' List view). Deliberately distinct from
// JobResultCard's job-search-oriented row (Save/Apply/More-options actions,
// meta facts like salary/seniority): this is a tracking view, so the row
// leads with the real pipeline status badge (STATUS_CLASSES/STATUS_LABELS
// from lib/applicationStatus.ts — the exact source the mockup's own badge
// colors were pulled from) instead of triage actions, which stay one click
// away on the job-detail page this row links to. "Interviewing" gets the
// rail's existing .signal-track-warm treatment (amber pulsing dot) — the
// one real "in motion" pipeline stage, matching the mockup's own
// `.track.warm` row.
export function MissionsListRow({
  job,
  selectable = false,
  selected = false,
  onToggleSelect,
  reappearanceSignal = null,
}: {
  job: Job;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  reappearanceSignal?: ReappearanceSignal;
}) {
  const sourceBadge = getSourceBadge(job.source);
  const signal = getListingSignal(job);
  const isWarm = job.application_status === "interviewing";

  return (
    <Link href={`/find-jobs/${job.id}`} className={`signal-track ${isWarm ? "signal-track-warm" : ""}`}>
      {selectable && (
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={selected ? "Deselect job" : "Select job"}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onToggleSelect?.();
          }}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
            selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-accent"
          }`}
        >
          {selected && <Check className="h-3.5 w-3.5" />}
        </button>
      )}
      <span className="signal-dot" />
      <CompanyLogo company={job.company} logoUrl={job.company_logo_url} applyUrl={job.external_apply_url} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-text-primary">{job.title ?? "Untitled role"}</p>
        <p className="mt-0.5 truncate text-xs text-text-muted">{job.company ?? "Unknown company"}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${STATUS_CLASSES[job.application_status]}`}
          >
            {STATUS_LABELS[job.application_status]}
          </span>
          {sourceBadge && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${sourceBadge.badgeClassName}`}
            >
              {sourceBadge.icon === "linkedin" && <LinkedInGlyph className="h-3 w-3" />}
              {sourceBadge.icon === "indeed" && <PlatformLogo source="indeed" className="h-3 w-3 rounded-[2px]" />}
              {sourceBadge.label}
            </span>
          )}
          {signal && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${
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
          {reappearanceSignal && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-medium text-warning">
              <Repeat className="h-3 w-3" />
              {reappearanceSignal.label}
            </span>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        {job.match_score !== undefined && job.match_score !== null ? (
          <>
            <div className={`font-mono text-lg font-bold leading-none tabular-nums ${scoreTierClass(job.match_score)}`}>
              {job.match_score}%
            </div>
            <div className="mt-1 font-mono text-[9.5px] uppercase tracking-wide text-text-muted">Match</div>
          </>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-agent" />
            <span className="font-mono text-xs font-medium text-text-secondary">Scoring…</span>
          </div>
        )}
      </div>
    </Link>
  );
}
