"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, DollarSign, MapPin, TrendingUp, X } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import type { Job } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";

// Job detail drawer / split view (build-plan.md §H) — fast browsing without
// leaving the results list. Deliberately a lightweight SUMMARY, not a
// replica of the real job detail page (app/find-jobs/[id]/page.tsx pulls in
// 25+ sub-components — Company Research, Interview Prep, Offer Workspace,
// etc. — reusing that here would either be a slow duplicate fetch or a
// stripped-down impostor of a page that already exists one click away).
// Reuses only data already present on the Job object passed in — zero new
// fetches, zero new cost.
export function JobDetailDrawer({ job, onClose }: { job: Job | null; onClose: () => void }) {
  useEffect(() => {
    if (!job) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [job, onClose]);

  if (!job) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="presentation">
      <div
        className="animate-in fade-in-0 absolute inset-0 bg-black/40 backdrop-blur-sm duration-150"
        onClick={onClose}
        role="presentation"
      />
      <div
        className="animate-in slide-in-from-right-8 fade-in-0 relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-border bg-surface shadow-card duration-200"
        role="dialog"
        aria-modal="true"
        aria-label={`Quick view — ${job.title}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border p-5">
          <div className="flex gap-3">
            <CompanyLogo company={job.company} logoUrl={job.company_logo_url} applyUrl={job.external_apply_url} />
            <div>
              <p className="text-base font-semibold leading-tight text-text-primary">{job.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-text-secondary">
                {job.company}
                {job.location && (
                  <span className="flex items-center gap-1 text-accent">
                    <span aria-hidden="true">·</span>
                    <MapPin className="h-3.5 w-3.5" /> {job.location}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quick view"
            className="shrink-0 rounded-full border border-border p-1.5 text-text-muted transition-colors hover:bg-surface-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-5 p-5">
          {job.match_score !== null && job.match_score !== undefined && (
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-secondary px-4 py-3">
              <span className="text-sm font-medium text-text-secondary">Match score</span>
              <span className="font-mono text-2xl font-semibold tabular-nums text-agent-dark">{job.match_score}</span>
            </div>
          )}

          {(job.job_type || job.salary || job.seniority_level) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-secondary">
              {job.job_type && (
                <span className="flex items-center gap-1.5">
                  <BriefcaseBusiness className="h-3.5 w-3.5 text-accent" /> {job.job_type}
                </span>
              )}
              {job.seniority_level && (
                <span className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-info" /> {job.seniority_level}
                </span>
              )}
              {job.salary && (
                <span className="flex items-center gap-1.5">
                  <DollarSign className="h-3.5 w-3.5 text-success" /> {job.salary}
                </span>
              )}
            </div>
          )}

          {/* Hero tier, not compact (2026-08-25, direct user report — see
              JobResultCard.tsx's own comment on this same change). */}
          {job.match_reason && (
            <AiReadsCard>
              <p className="text-xs leading-5 text-text-primary">{job.match_reason}</p>
            </AiReadsCard>
          )}

          {job.matched_skills && job.matched_skills.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Matched skills</p>
              <div className="flex flex-wrap gap-1.5">
                {job.matched_skills.slice(0, 8).map((skill) => (
                  <span key={skill} className="rounded-full bg-success-lightest px-2.5 py-1 text-xs font-medium text-success-foreground">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {job.about_role && (
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">About the role</p>
              <p className="line-clamp-6 text-sm leading-6 text-text-secondary">{job.about_role}</p>
            </div>
          )}

          <Link
            href={`/find-jobs/${job.id}`}
            className="btn-signal mt-2 inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-accent-foreground"
          >
            View full details
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
