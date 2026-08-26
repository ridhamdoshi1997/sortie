import Link from "next/link";
import { Award, Briefcase, Code2, DollarSign, Globe, MapPin, Rocket } from "lucide-react";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { AnimatedScoreValue } from "@/components/job-details/AnimatedScoreValue";

// Rebuilt for build-plan.md §S, then re-synced (2026-08-26, direct user
// report — the preview had drifted from the real product after this
// session's job-detail redesign) to actually mirror the CURRENT live
// EvaluationBreakdown.tsx: a distribution strip + a divided row list with
// neutral icon chips and a single colored grade badge per row, not the
// grid-of-circular-badge-tiles shape this preview used to show. Same real
// GRADE_STYLES palette/icons as the live component — representative demo
// content, not a live fetch (this is a public, unauthenticated page).
const PREVIEW_DIMENSIONS = [
  { name: "Skills/tech match", icon: Code2, grade: "A", badge: "bg-agent text-agent-foreground", bar: "bg-agent" },
  { name: "Compensation fit", icon: DollarSign, grade: "B", badge: "bg-agent-light text-agent-dark", bar: "bg-agent/55" },
  { name: "Growth trajectory", icon: Rocket, grade: "A", badge: "bg-agent text-agent-foreground", bar: "bg-agent" },
  { name: "Visa/work-auth fit", icon: Globe, grade: "C", badge: "bg-surface-secondary text-text-secondary", bar: "bg-text-muted/35" },
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
            <p className="fade-in-up mb-4 inline-flex items-center gap-1.5 rounded-full border border-overlay-foreground/15 bg-overlay-foreground/5 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-overlay-foreground/60">
              <span className="text-accent">&#9670;</span> Your explainable career agent
            </p>
            <h1
              className="fade-in-up text-[clamp(2.5rem,6vw,4rem)] font-semibold leading-[0.98] tracking-[-0.04em] text-overlay-foreground"
              style={{ animationDelay: "60ms" }}
            >
              Land interviews, not auto-rejections.
            </h1>
            <p
              className="fade-in-up mx-auto mt-6 max-w-xl text-base leading-7 text-overlay-foreground/70 sm:text-lg"
              style={{ animationDelay: "120ms" }}
            >
              Sortie scores every job across 10 real dimensions, tailors your résumé, and finds insider
              connections — so you spend effort on roles worth it, never a blind blast of applications.
            </p>
            <div
              className="fade-in-up mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ animationDelay: "180ms" }}
            >
              <TrackedCtaLink
                href="/login"
                eventName="marketing_cta_clicked"
                eventProperties={{ location: "hero" }}
                className="btn-signal inline-flex min-h-12 items-center rounded-md px-8 text-base font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5"
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
          <div className="fade-in-up mx-auto max-w-2xl rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8" style={{ animationDelay: "240ms" }}>
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
              <div className="flex items-center gap-2 rounded-xl border border-agent/25 bg-agent-light/50 px-3 py-1.5">
                <Award className="h-4 w-4 text-agent-dark" />
                <span className="font-mono text-lg font-semibold text-agent-dark">
                  <AnimatedScoreValue value={92} />
                </span>
              </div>
            </div>

            {/* Distribution strip — same real element as EvaluationBreakdown.tsx,
               one segment per dimension below, colored by that dimension's
               own grade tone. */}
            <div className="flex h-1.5 gap-[3px] overflow-hidden rounded-full">
              {PREVIEW_DIMENSIONS.map((dim, i) => (
                <span
                  key={dim.name}
                  className={`dim-bar-in h-full flex-1 rounded-full ${dim.bar}`}
                  style={{ animationDelay: `${300 + i * 40}ms` }}
                />
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-0.5 border-t border-border-light pt-1">
              {PREVIEW_DIMENSIONS.map((dim, i) => (
                <div
                  key={dim.name}
                  className="dim-card-in flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-surface-secondary/70"
                  style={{ animationDelay: `${360 + i * 60}ms` }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-secondary text-text-secondary">
                    <dim.icon className="h-4 w-4" />
                  </span>
                  <span className="flex-1 text-left text-sm font-medium text-text-primary">{dim.name}</span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${dim.badge}`}>
                    {dim.grade}
                  </span>
                </div>
              ))}
            </div>

            {/* Hero tier, not compact — same real depth/glow every other
               "AI Navigator reads" surface in the app now uses (2026-08-26,
               direct user report this was still on the older flat tier). */}
            <AiReadsCard className="dim-card-in mt-4 text-left" style={{ animationDelay: "620ms" }}>
              <p className="text-xs leading-5 text-text-primary">
                Strong skills and growth match; visa sponsorship isn&apos;t mentioned in the posting — worth
                confirming before you invest time tailoring.
              </p>
            </AiReadsCard>
          </div>
        </div>
      </div>
    </section>
  );
}
