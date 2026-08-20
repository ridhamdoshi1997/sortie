import { Check } from "lucide-react";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";

// Rebuilt for build-plan.md §S — a transparent pricing anchor even though
// monetization (build-plan.md §J) isn't live yet. Describes today's real
// state honestly (usage-capped, not a permanent unconditional promise) and
// marks the Pro tier as a real future plan, not implemented — never a fake
// price or a feature this app doesn't have.
const FREE_INCLUDES = [
  "10-dimension job evaluation",
  "ATS-safe résumé tailoring",
  "Application tracking",
  "Interview prep tools",
];

export function CTASection() {
  return (
    <section id="pricing" className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 text-center">
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary">
            Free to start. No unattended applications, ever.
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border-2 border-accent bg-surface p-8 shadow-card">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-accent">Free</p>
            <p className="mt-2 text-3xl font-bold text-text-primary">$0</p>
            <p className="mt-1 text-sm text-text-secondary">Everything you need to run a real search today.</p>
            <ul className="mt-6 flex flex-col gap-2.5 text-left">
              {FREE_INCLUDES.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm text-text-secondary">
                  <Check className="h-4 w-4 shrink-0 text-success" />
                  {item}
                </li>
              ))}
            </ul>
            <TrackedCtaLink
              href="/login"
              eventName="marketing_cta_clicked"
              eventProperties={{ location: "pricing" }}
              className="mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-accent px-6 text-sm font-semibold text-accent-foreground transition-opacity hover:opacity-90"
            >
              Start for free
            </TrackedCtaLink>
          </div>

          <div className="rounded-2xl border border-border bg-surface-tertiary p-8 opacity-70">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
              Pro — Coming soon
            </p>
            <p className="mt-2 text-3xl font-bold text-text-muted">&mdash;</p>
            <p className="mt-1 text-sm text-text-muted">
              Higher usage limits and deeper research tools for a heavy, ongoing search.
            </p>
            <button
              type="button"
              disabled
              className="mt-8 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-text-muted"
            >
              Not yet available
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
