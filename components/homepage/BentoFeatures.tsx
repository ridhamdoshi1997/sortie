import { FileCheck2, Gauge, Network, Puzzle, Workflow } from "lucide-react";

// Rebuilt for build-plan.md §S — replaces Features.tsx's generic light
// "landing-panel" layout with a bento grid grouped by real shipped
// capabilities, so the 10+ feature set is scannable rather than a wall of
// text. Every card describes something this app actually does — no
// placeholder/aspirational features.
export function BentoFeatures() {
  return (
    <section id="features" className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-accent">
            The Career OS
          </p>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary">
            Everything between finding a job and landing it
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div id="feature-evaluator" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-8 shadow-card md:col-span-2 md:row-span-2">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-agent-light">
              <Gauge className="h-5 w-5 text-agent-dark" />
            </div>
            <h3 className="text-xl font-semibold text-text-primary">10-Dimension Job Evaluator</h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
              Stop guessing. Every job gets scored across skills, compensation, seniority, growth,
              legitimacy, and 6 more dimensions — a real breakdown you can read, not one opaque
              percentage.
            </p>
            <div className="mt-6 flex flex-wrap gap-1.5">
              {["Skills/tech match", "Compensation fit", "Legitimacy", "Growth trajectory"].map((d) => (
                <span key={d} className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                  {d}
                </span>
              ))}
            </div>
          </div>

          <div id="feature-tailoring" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-light">
              <FileCheck2 className="h-4.5 w-4.5 text-accent" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">ATS-Safe Résumé Tailoring</h3>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">
              Rewritten to match the posting, formatted to survive the applicant-tracking filters that
              screen résumés before a human ever sees one.
            </p>
          </div>

          <div id="feature-connections" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-light">
              <Network className="h-4.5 w-4.5 text-accent" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Insider Connections</h3>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">
              Surfaces alumni, former colleagues, and people beyond your network already at the
              company — skip the front door.
            </p>
          </div>

          <div id="feature-extension" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-agent-light">
              <Puzzle className="h-4.5 w-4.5 text-agent-dark" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Capture Extension</h3>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">
              See a job anywhere on the web. Save it, grade it, and track it in one click — never a
              copy-paste round trip.
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-surface-secondary">
              <Workflow className="h-4.5 w-4.5 text-text-secondary" />
            </div>
            <h3 className="text-base font-semibold text-text-primary">Model-Agnostic Engine</h3>
            <p className="mt-1.5 text-sm leading-6 text-text-secondary">
              Powered by Gemini, Claude, and OpenAI — routed per task, never locked to one vendor&apos;s
              blind spots.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
