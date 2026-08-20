import { KeyRound, Kanban, MessagesSquare } from "lucide-react";

// Replaces HowItWorks.tsx for build-plan.md §S — that component's content
// (finding jobs, tailoring résumés) now overlaps with BentoFeatures.tsx's
// evaluator/tailoring cards, so this focuses on the genuinely uncovered
// ground: what happens after you decide to apply. Real shipped surfaces
// (Missions tracker, Interview Prep Engine), not aspirational ones.
const STAGES = [
  {
    icon: Kanban,
    title: "Track every application in one place",
    description:
      "Draft, applied, interviewing, offer — a real Kanban board (or a flat list, your call) instead of a spreadsheet you forget to update.",
  },
  {
    icon: KeyRound,
    title: "Walk in prepared, not guessing",
    description:
      "A question bank built from the actual posting, plus your own reusable STAR stories — ready before the recruiter calls, not scrambled together the night before.",
  },
  {
    icon: MessagesSquare,
    title: "Know what to say when it counts",
    description:
      "Negotiation scripts and offer analysis grounded in your own leverage, not generic advice that doesn't know your situation.",
  },
];

export function TheLifecycle() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-accent">
            Past the discovery
          </p>
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary">
            From tracked to offer, not just found
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {STAGES.map((stage) => {
            const Icon = stage.icon;
            return (
              <div key={stage.title} className="rounded-2xl border border-border bg-surface p-7 shadow-card">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-light">
                  <Icon className="h-5 w-5 text-accent" />
                </div>
                <h3 className="text-base font-semibold text-text-primary">{stage.title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-secondary">{stage.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
