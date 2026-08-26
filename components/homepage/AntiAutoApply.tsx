import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

// Rebuilt for build-plan.md §S — the explicit differentiation section the
// research called for: competitors race for auto-apply submission volume,
// Sortie wins on judgment. A condensed version of the full /methodology
// page's argument, not a duplicate of it.
export function AntiAutoApply() {
  return (
    <section className="px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="fade-in-up mx-auto max-w-3xl rounded-2xl border border-border bg-surface-tertiary p-8 text-center sm:p-12">
        <p className="mb-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          <ShieldCheck className="h-3.5 w-3.5 text-accent" /> Our position
        </p>
        <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.03em] text-text-primary">
          Quality over volume. You&apos;re not a spambot.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-text-secondary">
          Sortie will never submit an application unattended. AI does the research and the tailoring —
          you decide what actually gets sent, and a correction you make on one job sticks for every
          future one like it.
        </p>
        <Link
          href="/methodology"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent transition-opacity hover:opacity-80"
        >
          Read the full methodology
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
