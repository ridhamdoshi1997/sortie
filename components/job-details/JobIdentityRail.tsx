import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { formatDate } from "@/lib/utils";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { AnimatedScoreValue } from "@/components/job-details/AnimatedScoreValue";
import { ApplyLinkTrustNote } from "@/components/job-details/ApplyLinkTrustNote";
import { RequestScoringButton } from "@/components/job-details/RequestScoringButton";
import type { Job } from "@/types";

// Job-detail redesign (2026-08-25, direct user request to redesign this page
// from scratch rather than port the mockup).
//
// The problem this solves: the old page opened with a verdict strip, a
// 5-button toolbar and a 2-button row — three rows of ACTIONS — before it
// ever said which job you were looking at. The title sat ~370px down, and
// once you scrolled (the page runs 5+ screens) you lost the title, the
// score and the Apply button entirely, while a floating Apply pill
// duplicated the toolbar's own Apply on the same viewport.
//
// So identity and the primary action move into one sticky rail that never
// leaves the viewport, and the four oversized meta cards collapse into a
// compact definition list. The old meta cards also coloured their icons
// success-green / info-blue / accent-amber — three hues for four
// non-semantic facts; they're uniformly muted here, because none of Salary/
// Type/Found is a status. Location is the one exception (direct user
// request, 2026-08-28, applied consistently everywhere a job's location
// shows across the app): Sortie's amber accent, not because it's a status
// either, but because the user wants location specifically to read as the
// theme color throughout — same `text-accent` used on JobResultCard.tsx/
// KanbanCard.tsx/JobDetailDrawer.tsx's own location text.
function MetaRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd className={`min-w-0 truncate text-right text-[13px] font-medium ${accent ? "text-accent" : "text-text-primary"}`}>
        {value}
      </dd>
    </div>
  );
}

function formatJobType(jobType: string | null): string {
  if (!jobType) return "—";
  const normalized = jobType.replace(/[_-]/g, " ").trim();
  if (!normalized) return "—";
  return normalized
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function JobIdentityRail({ job }: { job: Job }) {
  const company = job.company ?? "Unknown company";
  const score = job.match_score ?? 0;
  const isScored = job.match_score !== null && job.match_score !== undefined;
  // Same tiering as JobResultCard's scoreTierClass — a strong match reads
  // agent-teal (it's an AI judgement), a middling one stays neutral, a weak
  // one recedes. Never green/red: this is a fit estimate, not a pass/fail.
  const scoreTone =
    score >= 80 ? "text-agent-dark" : score >= 60 ? "text-text-primary" : "text-text-muted";

  const applyUrl = job.external_apply_url ?? job.source_url ?? job.url;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start gap-3">
        <CompanyLogo company={job.company} logoUrl={job.company_logo_url} applyUrl={job.external_apply_url} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-[19px] font-semibold leading-[1.2] text-text-primary">
            {job.title ?? "Untitled role"}
          </h1>
          <p className="mt-1 truncate text-[13px] font-medium text-text-secondary">{company}</p>
        </div>
      </div>

      {/* Score leads with the number, with the meter as supporting detail —
          and only when a real evaluation exists. An unscored job showing
          "0%" would read as a terrible match rather than an unevaluated
          one, which is exactly the kind of false signal this app avoids. */}
      <div className="rounded-xl border border-border bg-surface-secondary px-4 py-3">
        {isScored ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                Match
              </span>
              <span className={`font-mono text-xl font-bold tabular-nums ${scoreTone}`}>
                <AnimatedScoreValue value={score} />
                <span className="text-xs font-semibold">%</span>
              </span>
            </div>
            <div className="signal-meter-track mt-2 w-full">
              <div
                className="signal-meter-fill signal-fill-in"
                style={{ "--fill": Math.min(1, Math.max(0, score / 100)) } as React.CSSProperties}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[12px] leading-5 text-text-muted">
              Not scored yet — still being evaluated.
            </p>
            <RequestScoringButton jobId={job.id} />
          </div>
        )}
      </div>

      <dl className="divide-y divide-border-light border-y border-border-light">
        <MetaRow label="Salary" value={job.salary || "Not disclosed"} />
        <MetaRow label="Location" value={job.location ?? "—"} accent />
        <MetaRow label="Type" value={formatJobType(job.job_type)} />
        <MetaRow label="Found" value={formatDate(job.found_at)} />
      </dl>

      {/* Desktop only below lg — the rail is sticky there, so this stays
          visible for the whole scroll and a second copy would just repeat
          it in the same viewport (the exact duplicate this redesign
          removed FloatingApplyButton to avoid). Below lg the rail isn't
          sticky (see page.tsx's order-first comment), so mobile gets its
          own persistent copy — MobileApplyBar below — instead of losing
          Apply the moment the user scrolls past the rail. */}
      {applyUrl ? (
        <Link
          href={applyUrl}
          target="_blank"
          rel="noreferrer"
          className="btn-signal hidden min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground lg:inline-flex"
        >
          Apply at {company}
          <span className="btn-signal-icon">
            <ExternalLink className="h-3 w-3" />
          </span>
        </Link>
      ) : (
        <div
          className="hidden min-h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-border bg-surface-secondary px-4 text-sm font-medium text-text-muted lg:inline-flex"
          title="No application link was saved for this job"
        >
          No application link
        </div>
      )}

      {applyUrl && (
        <ApplyLinkTrustNote applyUrl={applyUrl} company={job.company} jobId={job.id} jobTitle={job.title} />
      )}
    </div>
  );
}

// Mobile/tablet equivalent of the rail's own Apply button, which is
// deliberately `hidden lg:inline-flex` above — below lg the rail sits
// `order-first` in normal flow (page.tsx), not sticky, so Apply would
// otherwise scroll away exactly like the pre-redesign page did. Fixed to
// the viewport bottom instead, matching the rail's "Apply always reachable"
// intent for the breakpoint that can't use `position: sticky` for it.
// `pr-20` reserves the Navigator FAB's own footprint (h-14 fixed bottom-6
// right-6, i.e. an ~80px bottom-right square — NavigatorLauncher.tsx) so
// the button's real tap target never sits under it; a real collision
// there, confirmed live on a job with several status badges pushing this
// bar's content down into the FAB's fixed corner, silently ate the right
// third of "Apply at {company}"'s clickable area.
export function MobileApplyBar({ job }: { job: Job }) {
  const company = job.company ?? "Unknown company";
  const applyUrl = job.external_apply_url ?? job.source_url ?? job.url;

  if (!applyUrl) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/95 p-3 pr-24 backdrop-blur-sm lg:hidden">
      <Link
        href={applyUrl}
        target="_blank"
        rel="noreferrer"
        className="btn-signal flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-accent-foreground"
      >
        <span className="truncate">Apply at {company}</span>
        <span className="btn-signal-icon shrink-0">
          <ExternalLink className="h-3 w-3" />
        </span>
      </Link>
    </div>
  );
}
