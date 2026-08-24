import Link from "next/link";
import { Award, Briefcase, DollarSign, MapPin } from "lucide-react";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";

// Rebuilt for build-plan.md §S — outcome-oriented headline (not category-
// oriented), the app's real mission-console dark chrome (same
// .glass-panel-overlay/bg-overlay treatment as FindJobsForm.tsx's "Run a
// sortie" panel, not a bespoke light "landing-panel" theme), and a genuine
// preview of the real 10-dimension evaluator's grade-badge/Agent-read
// pattern instead of a static product screenshot. The preview panel is a
// faithful mockup of EvaluationBreakdown.tsx's real GRADE_STYLES palette —
// representative demo content, not a live fetch (this is a public,
// unauthenticated page).
const PREVIEW_DIMENSIONS = [
  { name: "Skills/tech match", grade: "A", badge: "bg-agent text-agent-foreground" },
  { name: "Compensation fit", grade: "B", badge: "bg-agent-light text-agent-dark" },
  { name: "Growth trajectory", grade: "A", badge: "bg-agent text-agent-foreground" },
  { name: "Visa/work-auth fit", grade: "C", badge: "bg-surface-secondary text-text-secondary" },
];

export function Hero() {
  return (
    <section className="px-4 pt-8 sm:px-6 sm:pt-10 lg:px-8">
      <div className="glass-panel-overlay mx-auto max-w-[1440px] rounded-2xl">
        {/* Subtle technical-blueprint grid, chrome-only per ui-tokens.md's
           Liquid Glass discipline — never applied to content cards. */}
        <div
          className="border-b border-overlay-foreground/10 px-6 py-16 text-center sm:px-10 sm:py-20 lg:px-16 lg:py-24"
          style={{
            backgroundImage:
              "linear-gradient(color-mix(in srgb, var(--color-overlay-foreground) 4%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--color-overlay-foreground) 4%, transparent) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        >
          <div className="mx-auto max-w-3xl">
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-overlay-foreground/15 bg-overlay-foreground/5 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-overlay-foreground/60">
              <span className="text-accent">&#9670;</span> Your explainable career agent
            </p>
            <h1 className="text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-overlay-foreground">
              Land interviews, not auto-rejections.
            </h1>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-overlay-foreground/70 sm:text-lg">
              Sortie scores every job across 10 real dimensions, tailors your résumé, and finds insider
              connections — so you spend effort on roles worth it, never a blind blast of applications.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <TrackedCtaLink
                href="/login"
                eventName="marketing_cta_clicked"
                eventProperties={{ location: "hero" }}
                className="inline-flex min-h-12 items-center rounded-md bg-accent px-8 text-base font-semibold text-accent-foreground transition-opacity hover:opacity-90"
              >
                Start for free
              </TrackedCtaLink>
              <Link
                href="/methodology"
                className="inline-flex min-h-12 items-center rounded-md border border-overlay-foreground/15 bg-overlay-foreground/5 px-8 text-base font-medium text-overlay-foreground transition-colors hover:bg-overlay-foreground/10"
              >
                See how it scores jobs
              </Link>
            </div>
          </div>
        </div>

        {/* Real 10-dimension evaluator preview — same grade-badge pattern as
           EvaluationBreakdown.tsx, real Agent-content callout treatment. */}
        <div className="px-4 py-10 sm:px-8 sm:py-14 lg:px-10">
          <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-base font-semibold text-text-primary">Senior Product Engineer</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5 text-accent" /> Notion
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-accent" /> Remote
                  </span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3.5 w-3.5 text-accent" /> $165K&ndash;$205K
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-secondary px-3 py-1.5">
                <Award className="h-4 w-4 text-agent-dark" />
                <span className="font-mono text-lg font-semibold text-agent-dark">92</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PREVIEW_DIMENSIONS.map((dim) => (
                <div key={dim.name} className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-surface-secondary p-3 text-center">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-bold ${dim.badge}`}>
                    {dim.grade}
                  </span>
                  <span className="text-[11px] leading-tight text-text-muted">{dim.name}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-r-lg border-l-2 border-agent bg-agent-light px-4 py-3 text-left">
              <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wide text-agent-dark">
                AI Navigator reads
              </p>
              <p className="text-xs leading-5 text-agent-dark">
                Strong skills and growth match; visa sponsorship isn&apos;t mentioned in the posting — worth
                confirming before you invest time tailoring.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
