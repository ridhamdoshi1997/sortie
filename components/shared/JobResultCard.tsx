"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, Ban, BriefcaseBusiness, Check, Clock, DollarSign, Flag, Heart, MapPin, Repeat, TrendingUp } from "lucide-react";

import { Card } from "@/components/ui/card";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { markJobUnavailable, setApplicationStatus, toggleHideJob, toggleSaveJob } from "@/actions/jobs";
import { getListingSignal } from "@/lib/jobStatus";
import type { ReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";

// Redesigned 2026-07-28 — was a literal green/blue/amber traffic light.
// This score is AI-generated, so the strong tier uses --color-agent (the
// app's AI-content signal), not a generic success green; the middle tier is
// neutral (a decent-but-unremarkable match isn't an "info" event); the low
// tier stays quiet rather than reading as an alarm — a low match score is
// informational, not an error. See EvaluationBreakdown.tsx's GRADE_STYLES
// for the same treatment applied to the 10-dimension letter grades.
function scoreTierClass(score: number) {
  if (score >= 80) return "text-agent-dark";
  if (score >= 60) return "text-text-primary";
  return "text-text-muted";
}

// Real tag pills from actual job fields — never fabricated placeholder tags.
// job_type is deliberately excluded here — it's already shown in the meta
// row above (job.job_type icon+label), no need to repeat it as a pill too.
function jobTags(job: Job): string[] {
  const tags: string[] = [];
  if (job.location && /remote/i.test(job.location)) tags.push("Remote");
  if (Array.isArray(job.matched_skills)) tags.push(...job.matched_skills.slice(0, 2));
  return tags.slice(0, 3);
}

// index drives an entrance stagger — optional so existing call sites don't
// need to change, capped at 8 so a long list doesn't leave later cards
// waiting nearly a second to appear.
export function JobResultCard({
  job,
  index = 0,
  reappearanceSignal = null,
}: {
  job: Job;
  index?: number;
  reappearanceSignal?: ReappearanceSignal;
}) {
  const tags = jobTags(job);
  const animationDelay = `${Math.min(index, 8) * 60}ms`;
  const [saved, setSaved] = useState(job.is_saved);
  const [hidden, setHidden] = useState(job.is_hidden);
  const [markedUnavailable, setMarkedUnavailable] = useState(Boolean(job.marked_unavailable_at));
  const [menuOpen, setMenuOpen] = useState(false);
  const [, startTransition] = useTransition();
  const menuRef = useRef<HTMLDivElement>(null);
  const signal = markedUnavailable
    ? { level: "confirmed" as const, label: "No longer available" }
    : getListingSignal(job);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function stop(event: React.MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  function handleSave(event: React.MouseEvent): void {
    stop(event);
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const result = await toggleSaveJob(job.id, next);
      if (!result.success) setSaved(!next);
    });
  }

  function handleAlreadyApplied(event: React.MouseEvent): void {
    stop(event);
    setMenuOpen(false);
    startTransition(async () => {
      await setApplicationStatus(job.id, job.application_status, "applied");
    });
  }

  function handleNotInterested(event: React.MouseEvent): void {
    stop(event);
    setMenuOpen(false);
    const next = !hidden;
    setHidden(next);
    startTransition(async () => {
      const result = await toggleHideJob(job.id, next);
      if (!result.success) setHidden(!next);
    });
  }

  function handleMarkUnavailable(event: React.MouseEvent): void {
    stop(event);
    setMenuOpen(false);
    setMarkedUnavailable(true);
    startTransition(async () => {
      const result = await markJobUnavailable(job.id);
      if (!result.success) setMarkedUnavailable(false);
    });
  }

  function handleReportIssue(event: React.MouseEvent): void {
    stop(event);
    setMenuOpen(false);
    const subject = encodeURIComponent(`Job listing issue: ${job.title ?? "Untitled"} at ${job.company ?? ""}`);
    window.open(`mailto:support@sortie.app?subject=${subject}`, "_blank");
  }

  if (hidden) return null;

  return (
    <Link href={`/find-jobs/${job.id}`}>
      <Card
        className="fade-in-up border border-border bg-surface shadow-card card-interactive-glow grid cursor-pointer grid-cols-[1fr_auto] items-start gap-4 rounded-2xl p-5"
        style={{ animationDelay }}
      >
        <div className="flex gap-3">
          <CompanyLogo company={job.company} logoUrl={job.company_logo_url} />
          <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-tight text-text-primary">{job.title}</p>
          <p className="mt-1 flex items-center gap-1 text-sm text-text-secondary">
            {job.company}
            {job.location && (
              <>
                <span aria-hidden="true">·</span>
                <span className="flex items-center gap-1 text-accent">
                  <MapPin className="h-3.5 w-3.5" /> {job.location}
                </span>
              </>
            )}
          </p>
          {(job.job_type || job.salary || job.seniority_level || job.years_experience_required) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
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
              {job.years_experience_required && (
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-text-muted" /> {job.years_experience_required}
                </span>
              )}
            </div>
          )}
          {tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[5px] border border-border px-2 py-0.5 text-[11px] text-text-secondary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          {signal && (
            <div
              className={`mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                signal.level === "confirmed"
                  ? "bg-warning text-warning-foreground"
                  : signal.level === "likely"
                    ? "bg-warning/15 text-warning"
                    : "bg-surface-secondary text-text-muted"
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              {signal.label}
            </div>
          )}
          {reappearanceSignal && (
            <div className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-medium text-warning">
              <Repeat className="h-3 w-3" />
              {reappearanceSignal.label}
            </div>
          )}
          </div>
        </div>

        {job.match_score !== undefined && job.match_score !== null ? (
          <div className="text-right">
            <div
              className={`font-mono text-2xl font-semibold tabular-nums ${scoreTierClass(job.match_score)}`}
            >
              {job.match_score}
            </div>
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
              Match
            </div>
          </div>
        ) : (
          // Real evaluation is a background AI call (Inngest), not
          // instant — this is what FindJobsForm's poll loop is filling in
          // once it lands. Showing nothing here (the old behavior) read as
          // broken; a visible "in progress" state is what makes the wait
          // legible instead of looking like the search half-failed.
          <div className="flex flex-col items-end gap-1 text-right">
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-info" />
              <span className="font-mono text-xs font-medium text-text-secondary">Scoring…</span>
            </div>
            <div className="h-2 w-12 animate-pulse rounded-full bg-surface-secondary" />
          </div>
        )}

        {/* AI Navigator reads — reserved teal treatment for AI-generated
            content, never used for anything else in the app */}
        {job.match_reason && (
          <div className="col-span-2 rounded-r-lg border-l-2 border-agent bg-agent-light px-3.5 py-2.5">
            <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-agent-dark">
              AI Navigator reads
            </p>
            <p className="text-xs leading-5 text-agent-dark">{job.match_reason}</p>
          </div>
        )}

        {/* Separate action strip, not overlaid on the card content — a
            border-topped footer row like a real toolbar, not icons floating
            on top of the title/score. */}
        <div className="col-span-2 flex items-center justify-end gap-1.5 border-t border-border pt-3">
          <button
            type="button"
            onClick={handleSave}
            aria-label={saved ? "Unsave job" : "Save job"}
            className={`rounded-full border border-border p-1.5 transition-colors hover:bg-surface-secondary ${saved ? "text-accent" : "text-text-muted"}`}
          >
            <Heart className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={(e) => {
                stop(e);
                setMenuOpen((v) => !v);
              }}
              aria-label="More options"
              aria-expanded={menuOpen}
              className="rounded-full border border-border p-1.5 text-text-muted transition-colors hover:bg-surface-secondary"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>

            {menuOpen && (
              <div className="glass-panel-strong absolute bottom-full right-0 z-10 mb-2 w-44 rounded-xl p-1.5">
                <button
                  type="button"
                  onClick={handleAlreadyApplied}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  <Check className="h-4 w-4" /> Already Applied
                </button>
                {!markedUnavailable && (
                  <button
                    type="button"
                    onClick={handleMarkUnavailable}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-warning/10 hover:text-warning"
                  >
                    <AlertTriangle className="h-4 w-4" /> No Longer Available
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleNotInterested}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  <Ban className="h-4 w-4" /> Not Interested
                </button>
                <button
                  type="button"
                  onClick={handleReportIssue}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
                >
                  <Flag className="h-4 w-4" /> Report Issue
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
