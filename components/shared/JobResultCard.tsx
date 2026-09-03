"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Ban, BriefcaseBusiness, Check, Clock, DollarSign, ExternalLink, Eye, FileText, Flag, Heart, Repeat, ShieldAlert, TrendingUp } from "lucide-react";

import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { markJobUnavailable, setApplicationStatus, toggleHideJob, toggleSaveJob } from "@/actions/jobs";
import { classifyApplyHost } from "@/lib/applyLinkTrust";
import { getListingSignal } from "@/lib/jobStatus";
import { getSourceBadge } from "@/lib/jobSource";
import { LinkedInGlyph } from "@/components/shared/LinkedInGlyph";
import { PlatformLogo } from "@/components/shared/PlatformLogo";
import type { ReappearanceSignal } from "@/lib/churnSignal";
import type { Job } from "@/types";
import { AiReadsCard } from "@/components/shared/AiReadsCard";

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
  selectable = false,
  selected = false,
  onToggleSelect,
  onQuickView,
}: {
  job: Job;
  index?: number;
  reappearanceSignal?: ReappearanceSignal;
  // Bulk actions on Missions (build-plan.md §H) — optional, same pattern as
  // index/reappearanceSignal, so every other call site is unaffected.
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  // Job detail drawer / split view (build-plan.md §H) — optional, same
  // pattern as the props above. When provided, a "Quick view" button opens
  // the drawer instead of navigating; the card's own primary Link/click
  // navigation is unaffected everywhere this prop isn't passed.
  onQuickView?: () => void;
}) {
  const router = useRouter();
  const tags = jobTags(job);
  const sourceBadge = getSourceBadge(job.source);
  // List-view surfacing of the same trust signal the job-detail page already
  // shows (ApplyLinkTrustNote.tsx) — direct user report ("so many finance
  // related jobs are showing third party portals like bebee"). Previously
  // only visible after clicking into a job; this is the same classifier, no
  // new logic, just a second, earlier surface for it.
  // Real user confusion found live (2026-09-01): a job just scraped and
  // not yet evaluated shows this badge against its raw, unresolved link —
  // reading as a final verdict on a job the app hasn't actually tried to
  // fix or judge yet. The real evaluation pipeline attempts a free link
  // repair for every job before it ever shows a genuine/not-genuine
  // result (lib/inngest/functions.ts's persist-chunk step), and hides
  // anything that still fails afterward — so a STILL-scoring job showing
  // this warning is always premature, never a real finding. Gated on
  // match_score being set (evaluation actually finished) so the badge
  // only ever reflects a link that was actually checked and still failed.
  const applyTrust = job.match_score !== null && job.external_apply_url ? classifyApplyHost(job.external_apply_url, job.company) : null;
  const isLowQualitySource = applyTrust === "low_quality" || applyTrust === "unverified";
  // Distinct from the warning above, deliberately (2026-09-03): an indirect
  // board (Adzuna — see INDIRECT_AGGREGATOR_HOSTS in lib/applyLinkTrust.ts)
  // is a REAL, established board, not a scam risk, so it must not borrow the
  // amber ShieldAlert treatment. But its link is a redirect to a source we
  // genuinely can't see ahead of time, and a candidate deserves to know that
  // before clicking rather than discovering it on landing. Neutral styling,
  // honest wording, no alarm.
  const isIndirectSource = applyTrust === "aggregator_indirect";
  const animationDelay = `${Math.min(index, 8) * 60}ms`;
  const [saved, setSaved] = useState(job.is_saved);
  const [hidden, setHidden] = useState(job.is_hidden);
  const [markedUnavailable, setMarkedUnavailable] = useState(Boolean(job.marked_unavailable_at));
  // Portaled + position-tracked (2026-08-25), not a plain relative/absolute
  // child — same pattern as JobActionBar.tsx's StatusMenuPanel, for the
  // same reason documented there: this card sits inside a normal vertical
  // list, so a merely-absolute dropdown paints UNDER or OVER whichever
  // sibling card happens to sit below it in the list (confirmed live —
  // the "More options" menu bled across two cards down, its lower half
  // rendered behind the third card's own content). Rendering to
  // document.body with position:fixed, computed from the trigger's real
  // getBoundingClientRect(), removes it from this card's stacking context
  // entirely.
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [, startTransition] = useTransition();
  const signal = markedUnavailable
    ? { level: "confirmed" as const, label: "No longer available" }
    : getListingSignal(job);

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
    setMenuPosition(null);
    startTransition(async () => {
      await setApplicationStatus(job.id, job.application_status, "applied");
    });
  }

  function handleNotInterested(event: React.MouseEvent): void {
    stop(event);
    setMenuPosition(null);
    const next = !hidden;
    setHidden(next);
    startTransition(async () => {
      const result = await toggleHideJob(job.id, next);
      if (!result.success) setHidden(!next);
    });
  }

  // Deep-links into the job detail page's DocumentGenerator, which already
  // supports a `?generate=resume` auto-trigger (originally built for the
  // "+ Add cover letter" ghost-slot flow) — reusing it here rather than
  // duplicating the generation call on this card.
  function handleGenerateResume(event: React.MouseEvent): void {
    stop(event);
    setMenuPosition(null);
    router.push(`/find-jobs/${job.id}?generate=resume`);
  }

  function handleMarkUnavailable(event: React.MouseEvent): void {
    stop(event);
    setMenuPosition(null);
    setMarkedUnavailable(true);
    startTransition(async () => {
      const result = await markJobUnavailable(job.id);
      if (!result.success) setMarkedUnavailable(false);
    });
  }

  function handleReportIssue(event: React.MouseEvent): void {
    stop(event);
    setMenuPosition(null);
    const subject = encodeURIComponent(`Job listing issue: ${job.title ?? "Untitled"} at ${job.company ?? ""}`);
    window.open(`mailto:support@sortie.app?subject=${subject}`, "_blank");
  }

  if (hidden) return null;

  // Job-search redesign (2026-08-25, direct user request — "too much on the
  // page", "colors blending"). Was a p-5 card with icon meta-row (accent
  // location pin, accent job-type icon, info-BLUE seniority, success-GREEN
  // salary — four unrelated meanings sharing decorative colors that exist
  // nowhere else as a signal, which is the literal definition of colors
  // blending), a footer action toolbar, and an always-expanded AI-reads
  // block, all inside one big bordered card. Rebuilt as the Signal
  // mockup's own dense `.job-row` pattern (`page-jobs` in the approved
  // mockup) — a flush single-border-per-row list (`.signal-rail`, the same
  // primitive /career already uses for its timelines), not a stack of
  // separately-bordered cards. Meta facts (type/seniority/salary/years)
  // are now one neutral text-text-secondary line — none of them is a
  // status, so none of them gets a color. AI reasoning still shows (real
  // feature, not cut) but as the mockup's compact `.ai-mini` tier via
  // AiReadsCard, collapsed into the row instead of ballooning the card.
  return (
    <Link
      href={`/find-jobs/${job.id}`}
      // Deliberately not .signal-track/.signal-rail — those assume a row
      // living inside a shared-border rail (fixed single-line padding,
      // align-items:center). This card is its own standalone bordered
      // item with two stacked parts (the row, then an optional AI-reads
      // block), so it gets its own flex-col + hover-tint instead of
      // fighting that primitive's base layout.
      // No overflow-hidden — the AI-reads block below already sits inside
      // its own px-4 pb-3.5 padding and never touches this card's edges,
      // so clipping wasn't buying anything visually. It WAS silently
      // clipping the "More options" dropdown, which is an absolutely-
      // positioned child meant to float outside the row's own bounds —
      // caught live (the menu rendered clipped/wrapped/overlapping
      // adjacent content instead of floating cleanly below the button).
      className="fade-in-up flex flex-col rounded-xl border border-border bg-surface transition-colors hover:bg-surface-secondary"
      style={{ animationDelay }}
    >
      <div className="flex items-start gap-3 px-4 py-3.5">
        {selectable && (
          <button
            type="button"
            role="checkbox"
            aria-checked={selected}
            aria-label={selected ? "Deselect job" : "Select job"}
            onClick={(event) => {
              stop(event);
              onToggleSelect?.();
            }}
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
              selected ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface hover:border-accent"
            }`}
          >
            {selected && <Check className="h-3.5 w-3.5" />}
          </button>
        )}
        <CompanyLogo company={job.company} logoUrl={job.company_logo_url} applyUrl={job.external_apply_url} />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight text-text-primary">{job.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-text-secondary">
            <span className="truncate">{job.company}</span>
            {job.location && (
              <span className="flex items-center gap-1 truncate text-accent">
                <span aria-hidden="true" className="text-text-muted">·</span>
                {job.location}
              </span>
            )}
            {sourceBadge && (
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium ${sourceBadge.badgeClassName}`}>
                {job.source === "linkedin" && <LinkedInGlyph className="h-3 w-3" />}
                {job.source === "indeed" && <PlatformLogo source="indeed" className="h-3 w-3 rounded-[2px]" />}
                {sourceBadge.label}
              </span>
            )}
          </p>

          {/* Restored per-user request: these icon colors read as distinct
              and legible in practice (amber/teal/green), not "blending" —
              that critique landed on the location-pin/job-type/user-tags
              accent OVERUSE elsewhere on the old card, not this row. Kept
              exactly as before. */}
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

          {(tags.length > 0 || (Array.isArray(job.tags) && job.tags.length > 0) || signal || reappearanceSignal || isLowQualitySource || isIndirectSource) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {isLowQualitySource && (
                <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-medium text-warning">
                  <ShieldAlert className="h-3 w-3" />
                  Third-party source
                </span>
              )}
              {isIndirectSource && (
                <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10.5px] font-medium text-text-secondary">
                  <ExternalLink className="h-3 w-3" />
                  Via Adzuna — one more click
                </span>
              )}
              {tags.map((tag) => (
                <span key={tag} className="rounded-full border border-border px-2 py-0.5 text-[10.5px] text-text-secondary">
                  {tag}
                </span>
              ))}
              {Array.isArray(job.tags) &&
                job.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-accent-muted px-2 py-0.5 text-[10.5px] font-medium text-accent">
                    {tag}
                  </span>
                ))}
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
          )}
        </div>

        {/* Score + row actions share one right-hand column now (direct
            user request) — Eye/Heart/Ban sit below the score instead of
            beside it as a separate top-aligned strip, and each icon gets
            a real resting color (text-text-secondary, matching
            JobActionBar's own base icon tone) instead of text-muted. */}
        <div className="flex shrink-0 flex-col items-end gap-2 self-stretch justify-center border-l border-border pl-4 text-right">
          {job.match_score !== undefined && job.match_score !== null ? (
            <div>
              <div className={`font-mono text-[28px] font-bold leading-none tabular-nums ${scoreTierClass(job.match_score)}`}>
                {job.match_score}
                <span className="text-base">%</span>
              </div>
              <div className="mt-1.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">Match</div>
            </div>
          ) : (
            // Real evaluation is a background AI call (Inngest), not
            // instant. Showing nothing here read as broken; a visible
            // "in progress" state makes the wait legible. Agent-teal dot,
            // not info-blue — this IS an AI-pipeline status.
            <div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-pulse rounded-full bg-agent" />
                <span className="font-mono text-xs font-medium text-text-secondary">Scoring…</span>
              </div>
              <div className="mt-1 h-2 w-12 animate-pulse rounded-full bg-surface-secondary" />
            </div>
          )}

          {/* One shared resting color for all three (direct user request:
              "a color", singular — not three different hues, which would
              just reopen the blending problem). Amber at reduced opacity,
              since amber is already this row's own action-color (job_type
              icon, Apply CTA elsewhere) — Heart escalates to full-strength
              accent once actually saved, so save still reads as a real
              state change, not just a resting tint. */}
          <div className="flex items-center gap-1">
            {onQuickView && (
              <button
                type="button"
                onClick={(e) => {
                  stop(e);
                  onQuickView();
                }}
                aria-label="Quick view"
                className="rounded-full p-1.5 text-accent/70 transition-colors hover:bg-surface-secondary hover:text-accent"
              >
                <Eye className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              aria-label={saved ? "Unsave job" : "Save job"}
              className={`rounded-full p-1.5 transition-colors hover:bg-surface-secondary ${saved ? "text-accent" : "text-accent/70 hover:text-accent"}`}
            >
              <Heart className={`h-3.5 w-3.5 ${saved ? "fill-current" : ""}`} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                stop(e);
                if (menuPosition) {
                  setMenuPosition(null);
                  return;
                }
                // Right-align the panel to the trigger's right edge (its
                // visual position before this became a portal) — MENU_WIDTH
                // matches the panel's own w-44 (176px) below.
                const rect = e.currentTarget.getBoundingClientRect();
                setMenuPosition({ top: rect.bottom + 4, left: rect.right - 176 });
              }}
              aria-label="More options"
              aria-expanded={menuPosition !== null}
              className="rounded-full p-1.5 text-accent/70 transition-colors hover:bg-surface-secondary hover:text-accent"
            >
              <Ban className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {menuPosition && (
        <MoreOptionsMenu
          position={menuPosition}
          markedUnavailable={markedUnavailable}
          onGenerateResume={handleGenerateResume}
          onAlreadyApplied={handleAlreadyApplied}
          onMarkUnavailable={handleMarkUnavailable}
          onNotInterested={handleNotInterested}
          onReportIssue={handleReportIssue}
          onClose={() => setMenuPosition(null)}
        />
      )}

      {/* AI reasoning — real feature, kept, inset inside the row rather
          than full-bleed against the card's own edges. Upgraded to the
          hero tier (2026-08-25, direct user report: the flatter compact
          tier "still looks old" next to the dashboard's WeeklyBriefingCard)
          — real depth (gradient + outer glow), not just a flat tint, even
          repeated once per row in a list. */}
      {job.match_reason && (
        <div className="px-4 pb-3.5">
          <AiReadsCard>
            <p className="text-xs leading-5 text-text-primary">{job.match_reason}</p>
          </AiReadsCard>
        </div>
      )}
    </Link>
  );
}

// Portaled to document.body, position:fixed from the trigger's own
// getBoundingClientRect() — same recipe as JobActionBar.tsx's
// StatusMenuPanel. Extracted as its own component (rather than inlined
// like StatusMenuPanel is) because JobResultCard renders many times in one
// list; keeping the click-outside/Escape/scroll listeners scoped to a
// small mounted-only-when-open component avoids wiring them per-card
// whether or not that card's menu is ever opened.
function MoreOptionsMenu({
  position,
  markedUnavailable,
  onGenerateResume,
  onAlreadyApplied,
  onMarkUnavailable,
  onNotInterested,
  onReportIssue,
  onClose,
}: {
  position: { top: number; left: number };
  markedUnavailable: boolean;
  onGenerateResume: (e: React.MouseEvent) => void;
  onAlreadyApplied: (e: React.MouseEvent) => void;
  onMarkUnavailable: (e: React.MouseEvent) => void;
  onNotInterested: (e: React.MouseEvent) => void;
  onReportIssue: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onClose();
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // A fixed-position panel doesn't track its trigger during scroll —
  // close rather than let it drift away from the button that opened it.
  useEffect(() => {
    window.addEventListener("scroll", onClose, true);
    return () => window.removeEventListener("scroll", onClose, true);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: position.top, left: position.left }}
      className="glass-panel-strong animate-in fade-in-0 zoom-in-95 z-50 w-44 rounded-xl p-1.5 duration-150"
    >
      <button
        type="button"
        onClick={onGenerateResume}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <FileText className="h-4 w-4" /> Generate Résumé
      </button>
      <button
        type="button"
        onClick={onAlreadyApplied}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <Check className="h-4 w-4" /> Already Applied
      </button>
      {!markedUnavailable && (
        <button
          type="button"
          onClick={onMarkUnavailable}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-warning/10 hover:text-warning"
        >
          <AlertTriangle className="h-4 w-4" /> No Longer Available
        </button>
      )}
      <button
        type="button"
        onClick={onNotInterested}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <Ban className="h-4 w-4" /> Not Interested
      </button>
      <button
        type="button"
        onClick={onReportIssue}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary"
      >
        <Flag className="h-4 w-4" /> Report Issue
      </button>
    </div>,
    document.body,
  );
}
