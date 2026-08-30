import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getQuestionBankEntryBySlug } from "@/lib/interviewSeo";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getQuestionBankEntryBySlug(slug);
  if (!entry) return { title: "Interview questions | Sortie" };

  const title = `${entry.roleFamily} Interview Questions at ${entry.company} | Sortie`;
  const description = `${entry.questions.length} real interview questions for a ${entry.roleFamily} role at ${entry.company}, each with the reasoning behind why it's asked — from Sortie's Interview Prep engine.`;
  return { title, description };
}

const CATEGORY_LABELS: Record<string, string> = {
  technical: "Technical",
  behavioral: "Behavioral",
  system_design: "System design",
  culture_fit: "Culture fit",
};

// Individual programmatic SEO page — build-plan.md's Phase 19 homepage
// research ("Behavioral Interview Questions for Product Managers at
// Stripe"). Real questions only (lib/interviewSeo.ts never fabricates an
// entry); FAQPage structured data is the honest schema.org fit for this
// content shape (Q&A pairs), not JobPosting — this isn't a job listing.
export default async function InterviewQuestionEntryPage({ params }: Props) {
  const { slug } = await params;
  const entry = await getQuestionBankEntryBySlug(slug);
  if (!entry) notFound();

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entry.questions.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.rationale },
    })),
  };

  return (
    <>
      {/* schema.org JSON-LD, not user-facing HTML — content is our own structured data, never scraped/user input */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
      <Navbar />
      <main className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-16 sm:px-6 lg:px-8">
        <Link href="/interview-questions" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-3.5 w-3.5" />
          All companies
        </Link>

        <div className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <MessageSquare className="h-3.5 w-3.5" />
            Interview Prep
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            {entry.roleFamily} interview questions at {entry.company}
          </h1>
          <p className="text-lg leading-8 text-text-secondary">
            {entry.questions.length} real questions{entry.seniority ? ` for a ${entry.seniority.toLowerCase()}-level role` : ""}, each
            with the reasoning behind why {entry.company} is likely to ask it.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {entry.questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-border bg-surface p-5">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-surface-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-text-muted">
                  {CATEGORY_LABELS[q.category] ?? q.category}
                </span>
              </div>
              <p className="mt-2 text-base font-medium text-text-primary">{q.question}</p>
              <p className="mt-2 text-sm leading-6 text-text-secondary">{q.rationale}</p>
            </div>
          ))}
        </div>

        <div className="rounded-xl border border-agent/20 bg-agent-light/50 p-5 text-center">
          <p className="text-sm font-medium text-agent-dark">
            Want a practice sandbox, STAR story matching, and a live mock plan for this exact role?
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
