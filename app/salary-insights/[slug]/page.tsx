import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, DollarSign } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getSalaryInsightBySlug } from "@/lib/salaryInsightsSeo";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const insight = await getSalaryInsightBySlug(slug);
  if (!insight) return { title: "Salary insights | Sortie" };

  const title = `${insight.roleFamily} Salary in ${insight.location} | Sortie`;
  const description = `Real ${insight.roleFamily} salary range in ${insight.location}: ${insight.currency} ${insight.typicalLow.toLocaleString()}–${insight.typicalHigh.toLocaleString()} typical, based on ${insight.sampleSize} real job postings.`;
  return { title, description };
}

// Individual programmatic SEO page. Numbers here are real aggregates over
// real job postings (see lib/salaryInsightsSeo.ts) — no forced schema.org
// markup, since nothing in that vocabulary honestly fits a salary-range
// aggregate (unlike interview Q&A, which is a genuine FAQPage fit).
export default async function SalaryInsightPage({ params }: Props) {
  const { slug } = await params;
  const insight = await getSalaryInsightBySlug(slug);
  if (!insight) notFound();

  const asOfDate = insight.mostRecentPosting
    ? new Date(insight.mostRecentPosting).toLocaleDateString("en-US", { year: "numeric", month: "long" })
    : null;

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/salary-insights" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />
          All salary insights
        </Link>

        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <DollarSign className="h-3.5 w-3.5" />
            Salary Insights
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {insight.roleFamily} salary in {insight.location}
          </h1>
          <p className="text-lg leading-8 text-text-secondary">
            Based on {insight.sampleSize} real job postings Sortie has found{asOfDate ? `, most recently in ${asOfDate}` : ""}.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-surface p-6">
          <p className="text-sm font-medium text-text-muted">Typical range</p>
          <p className="mt-1 font-display text-3xl font-bold text-text-primary">
            {insight.currency} {insight.typicalLow.toLocaleString()}–{insight.typicalHigh.toLocaleString()}
          </p>
          <p className="mt-1 text-sm text-text-secondary">per year</p>

          <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-text-secondary">
              Full observed range: {insight.currency} {insight.observedLow.toLocaleString()}–
              {insight.observedHigh.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-secondary p-5 text-sm leading-6 text-text-secondary">
          <p>
            <span className="font-medium text-text-primary">How this is calculated:</span> the &quot;typical range&quot; is
            the median low and median high across every real posting in this bucket. Hourly rates are annualized
            assuming full-time (2,080 hours/year). Postings with implausible or unparseable pay text are excluded
            rather than guessed at.
          </p>
        </div>

        <div className="rounded-xl border border-agent/20 bg-agent-light/50 p-5 text-center">
          <p className="text-sm font-medium text-agent-dark">
            Want jobs matched to your actual resume, scored against postings like these?
          </p>
          <Link
            href="/login?mode=signup"
            className="btn-signal mt-3 inline-flex min-h-9 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
          >
            Start for free
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
