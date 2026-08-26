import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { MapPin } from "lucide-react";

import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { EvaluationBreakdown } from "@/components/job-details/EvaluationBreakdown";
import { AiReadsCard } from "@/components/shared/AiReadsCard";
import { createInsforgeServer } from "@/lib/insforge-server";
import type { JobEvaluationDimension } from "@/types";

export const dynamic = "force-dynamic";

type ShareRow = {
  share_token: string;
  title: string | null;
  company: string | null;
  location: string | null;
  match_score: number | null;
  overall_grade: "A" | "B" | "C" | "D" | "F" | null;
  match_reason: string | null;
  evaluation: JobEvaluationDimension[] | null;
  found_at: string | null;
};

// Public, unauthenticated page (build-plan.md §I) — reads only from
// public.job_shares, a narrow projection view (see
// migrations/20260820040624_add-job-share-link.sql) that exposes exactly
// the columns below and nothing else: never the scraped posting
// description, salary, personal notes, tags, or application status. The
// anon role can SELECT this view directly; createInsforgeServer() here
// runs unauthenticated (no requireUser()), same as any other public route.
async function getSharedEvaluation(token: string): Promise<ShareRow | null> {
  const insforge = await createInsforgeServer();
  const { data } = await insforge.database
    .from("job_shares")
    .select("share_token,title,company,location,match_score,overall_grade,match_reason,evaluation,found_at")
    .eq("share_token", token)
    .maybeSingle<ShareRow>();
  return data ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const job = await getSharedEvaluation(token);
  if (!job) return {};
  const title = job.title ?? "a role";
  const company = job.company ?? "a company";
  return {
    title: `${title} at ${company} — Sortie evaluation`,
    description: job.match_reason ?? `An AI-generated fit evaluation for ${title} at ${company}, shared via Sortie.`,
  };
}

export default async function SharedEvaluationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const job = await getSharedEvaluation(token);

  if (!job) {
    notFound();
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto w-full max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <AiReadsCard className="mb-6">
          <p className="text-sm leading-6 text-text-primary">
            This is a shared, read-only view of one person&apos;s AI-generated job-fit evaluation from Sortie — not
            a job listing, and not affiliated with the employer.
          </p>
        </AiReadsCard>

        <h1 className="text-2xl font-semibold leading-tight text-text-primary">{job.title ?? "Untitled role"}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
          <span className="font-medium text-text-primary">{job.company ?? "Unknown company"}</span>
          {job.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {job.location}
            </span>
          )}
        </div>

        {job.match_score != null && (
          <p className="mt-4 font-mono text-3xl font-semibold tabular-nums text-agent-dark">
            {Math.round(job.match_score)}% match
          </p>
        )}

        {job.match_reason && <p className="mt-3 text-sm leading-6 text-text-secondary">{job.match_reason}</p>}

        {job.evaluation && job.evaluation.length > 0 && (
          <div className="mt-8">
            <EvaluationBreakdown evaluation={job.evaluation} overallGrade={job.overall_grade} />
          </div>
        )}

        <div className="mt-10 rounded-2xl border border-border bg-surface-secondary p-6 text-center">
          <p className="text-sm text-text-secondary">
            Sortie evaluates any job against your real skills and career goals across 10 dimensions.
          </p>
          <Link
            href="/"
            className="mt-3 inline-flex min-h-9 items-center justify-center rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
          >
            Evaluate your own fit
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
