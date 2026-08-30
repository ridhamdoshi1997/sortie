import Link from "next/link";
import type { Metadata } from "next";
import { DollarSign } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { listSalaryInsights } from "@/lib/salaryInsightsSeo";

export const metadata: Metadata = {
  title: "Real Salary Ranges by Role & Location | Sortie",
  description:
    "Real salary ranges aggregated from actual job postings Sortie has scraped, broken down by role and location — not survey data or self-reported estimates.",
};

export const revalidate = 3600;

// Programmatic SEO hub, built on real employer-posted salary text
// (jobs.salary) aggregated across many real postings — see
// lib/salaryInsightsSeo.ts's header for why this data source was chosen
// over jobs.company_research (which carries per-candidate personal data
// and unreliable employer attribution, verified live 2026-08-30).
export default async function SalaryInsightsHubPage() {
  const insights = await listSalaryInsights();

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <DollarSign className="h-3.5 w-3.5" />
            Salary Insights
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Real salary ranges, by role and location
          </h1>
          <p className="text-lg leading-8 text-text-secondary">
            Every range below comes from real job postings Sortie has found — not a survey, not a self-reported
            estimate. Each page shows exactly how many real postings it&apos;s based on.
          </p>
        </div>

        {insights.length === 0 ? (
          <p className="text-sm text-text-secondary">No salary data published yet — check back soon.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {insights.map((insight) => (
              <li key={insight.slug}>
                <Link
                  href={`/salary-insights/${insight.slug}`}
                  className="block rounded-xl border border-border bg-surface p-4 transition-colors hover:bg-surface-secondary"
                >
                  <p className="font-medium text-text-primary">{insight.roleFamily}</p>
                  <p className="mt-1 text-sm text-text-secondary">in {insight.location}</p>
                  <p className="mt-2 text-xs text-text-muted">
                    {insight.currency} {insight.typicalLow.toLocaleString()}–{insight.typicalHigh.toLocaleString()}{" "}
                    typical · {insight.sampleSize} real postings
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  );
}
