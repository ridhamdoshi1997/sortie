import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { QuestionBankPanel } from "@/components/interview/QuestionBankPanel";
import { StarStoryMatrix } from "@/components/interview/StarStoryMatrix";
import { listStarStories } from "@/actions/starStories";
import { formatDate } from "@/lib/utils";

type InterviewingJobRow = {
  id: string;
  title: string | null;
  company: string | null;
  company_logo_url: string | null;
  application_status_updated_at: string | null;
};

// "Command Center" structure researched via agy (build-plan.md §O): active
// interviews lead the page (the user's real, immediate anxiety), the shared
// Question Bank search sits below for research before/independent of any
// specific application. Job-specific prep (Panel Topology, Trap Door
// Predictor, the same Question Bank pre-filled) lives on each job's own
// detail page, not duplicated here — see app/find-jobs/[id]/page.tsx.
export default async function InterviewPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: interviewingJobs } = await insforge.database
    .from("jobs")
    .select("id,title,company,company_logo_url,application_status_updated_at")
    .eq("user_id", user.id)
    .eq("application_status", "interviewing")
    .order("application_status_updated_at", { ascending: false })
    .returns<InterviewingJobRow[]>();

  const jobs = interviewingJobs ?? [];

  const starStoriesResult = await listStarStories();
  const starStories = starStoriesResult.data ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="font-display fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Interview
          </h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Active missions, and a question bank for any company you&apos;re researching.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-card">
          <h2 className="text-xs font-semibold uppercase leading-4 tracking-wide text-text-secondary">
            Active missions
          </h2>

          {jobs.length === 0 ? (
            <p className="mt-3 text-sm text-text-muted">
              No active interviews. Start applying, or use the question bank below to practice for
              any company.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/find-jobs/${job.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-accent"
                >
                  <CompanyLogo company={job.company ?? "?"} logoUrl={job.company_logo_url} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {job.title ?? "Untitled role"}
                    </p>
                    <p className="truncate text-xs text-text-secondary">
                      {job.company}
                      {job.application_status_updated_at &&
                        ` · Interviewing since ${formatDate(job.application_status_updated_at)}`}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground">
                    Enter prep room
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <QuestionBankPanel />

        <StarStoryMatrix initialStories={starStories} />
      </main>
    </>
  );
}
