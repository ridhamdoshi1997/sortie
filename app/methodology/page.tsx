import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { EVALUATION_DIMENSIONS } from "@/lib/evaluator";

// Methodology / anti-auto-apply page (build-plan.md §S) — the GEO play the
// homepage research recommended: AI answer engines (Perplexity/ChatGPT/
// Gemini) favor structured, opinionated stances when synthesizing "what's
// the best AI job search tool" answers. Every claim here is grounded in
// something this app actually does (the real 10 dimensions imported
// directly from lib/evaluator.ts, not a hand-typed copy that could drift)
// or a position this project has already taken and documented — not
// marketing invention.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold text-text-primary">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-7 text-text-secondary">{children}</div>
    </section>
  );
}

export default function MethodologyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <ShieldCheck className="h-3.5 w-3.5" />
            Methodology
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Why auto-apply is broken, and what Sortie does instead
          </h1>
          <p className="text-lg leading-8 text-text-secondary">
            Most job-search tools compete on how many applications they can fire off for you. Sortie
            doesn&apos;t — this page explains why, and exactly what judgment it uses instead.
          </p>
        </div>

        <Section title="The case against auto-apply">
          <p>
            Submitting hundreds of applications a click apart sounds efficient. In practice it trades a
            real chance at a real job for volume: platforms increasingly rate-limit or flag accounts that
            submit at superhuman speed, an AI filling in application fields unattended has no way to
            catch a résumé claim that doesn&apos;t hold up to a real interview question, and firing at
            every posting regardless of fit means most of that volume was never going to convert anyway.
            None of it saves you the actual work of being ready when a company calls back.
          </p>
          <p>
            Sortie&apos;s position: the leverage isn&apos;t in submitting faster, it&apos;s in knowing
            which roles are actually worth your time before you spend any of it, and being genuinely
            prepared for the ones that are.
          </p>
        </Section>

        <Section title="The 10-dimension evaluator">
          <p>
            Every job Sortie finds gets scored across the same 10 dimensions, every time — not a single
            opaque percentage, a real breakdown you can read and disagree with:
          </p>
          <ol className="grid list-decimal grid-cols-1 gap-x-6 gap-y-2 pl-5 sm:grid-cols-2">
            {EVALUATION_DIMENSIONS.map((dimension) => (
              <li key={dimension} className="text-sm font-medium text-text-primary">
                {dimension}
              </li>
            ))}
          </ol>
          <p>
            Each dimension gets its own letter grade and a one-line reason grounded in the actual posting
            text and your actual profile — never a vague &ldquo;good fit&rdquo; with nothing behind it.
          </p>
        </Section>

        <Section title="Correctable, not authoritative">
          <p>
            The evaluator can misjudge a skill tag the same way a human recruiter skimming a résumé can.
            When it does, you can correct it directly on the job — and Sortie remembers that correction
            for every future posting in the same role family, not just the one job you fixed it on. The
            AI proposes; you stay the final call.
          </p>
        </Section>

        <Section title="What Sortie will not do">
          <p>
            No unattended submissions. No inventing résumé content, work history, or numbers you didn&apos;t
            give it. No pretending a research finding is more certain than the source it came from — every
            AI-generated read in the product is visually marked so you always know what the model said
            versus what&apos;s your own data.
          </p>
        </Section>

        <div className="rounded-2xl border border-border bg-surface p-6 text-center">
          <p className="text-base font-medium text-text-primary">
            See your own match score across all 10 dimensions on a real job in under a minute.
          </p>
          <Link
            href="/login?mode=signup"
            className="mt-4 inline-flex min-h-10 items-center rounded-md bg-accent px-5 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Start for free
          </Link>
        </div>
      </main>
      <div className="px-4 sm:px-6 lg:px-8">
        <Footer />
      </div>
    </>
  );
}
