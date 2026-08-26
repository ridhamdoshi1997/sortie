import Link from "next/link";
import { ArrowRight, BookOpen, Code2, Target } from "lucide-react";

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

  const [{ data: interviewingJobs }, { data: recentJobRows }] = await Promise.all([
    insforge.database
      .from("jobs")
      .select("id,title,company,company_logo_url,application_status_updated_at")
      .eq("user_id", user.id)
      .eq("application_status", "interviewing")
      .order("application_status_updated_at", { ascending: false })
      .returns<InterviewingJobRow[]>(),
    // Broader real-company pool for the Question Bank's "practice for a
    // company you're tracking" grid (restructure, 2026-08-26) — not just
    // interviewing jobs, since practicing BEFORE an interview is the more
    // common real use case. Real title/company/logo per row, not a
    // fabricated directory.
    insforge.database
      .from("jobs")
      .select("id,title,company,company_logo_url,found_at")
      .eq("user_id", user.id)
      .eq("is_hidden", false)
      .not("company", "is", null)
      .order("found_at", { ascending: false })
      .limit(40)
      .returns<{ id: string; title: string | null; company: string | null; company_logo_url: string | null; found_at: string | null }[]>(),
  ]);

  const jobs = interviewingJobs ?? [];

  // One real card per distinct company — first (most recent) title/logo
  // seen for that company wins, capped at 8 so the grid stays a grid, not
  // a wall. Interviewing jobs are folded in too (same real-company pool,
  // sorted to the front) so a company already in "Active missions" doesn't
  // need a separate, differently-shaped entry below.
  const seenCompanies = new Set<string>();
  const quickStartJobs: { company: string; title: string; logoUrl: string | null }[] = [];
  for (const row of [...jobs, ...(recentJobRows ?? [])]) {
    if (!row.company || seenCompanies.has(row.company)) continue;
    seenCompanies.add(row.company);
    quickStartJobs.push({ company: row.company, title: row.title ?? "", logoUrl: row.company_logo_url });
  }
  const quickStartCards = quickStartJobs.slice(0, 8);

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

        {/* Capability strip (2026-08-26, direct user report: "how will
           users know they have a live code editor and other features?") —
           real, findable up front, not something a user has to stumble
           into 3 clicks deep. Not another card grid to scroll past — a
           single slim row, since these are wayfinding labels, not content
           to weigh equally against Active missions/Question Bank below. */}
        <div className="fade-in-up flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-muted" style={{ animationDelay: "30ms" }}>
          <span className="flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            AI-predicted question bank, any company
          </span>
          <span className="flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-agent" />
            Live in-browser code editor with graded tests
          </span>
          <span className="flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-accent" />
            Reusable STAR stories for behavioral questions
          </span>
        </div>

        <div className="fade-in-up rounded-2xl border border-border bg-surface p-6 shadow-card" style={{ animationDelay: "60ms" }}>
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
              {jobs.map((job, i) => (
                <Link
                  key={job.id}
                  href={`/find-jobs/${job.id}`}
                  className="dim-card-in flex items-center gap-3 rounded-xl border border-border bg-surface-secondary p-4 transition-all hover:-translate-y-0.5 hover:border-accent hover:shadow-card"
                  style={{ animationDelay: `${Math.min(i, 8) * 50}ms` }}
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
                  <span className="btn-signal inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-accent-foreground">
                    Enter prep room
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="fade-in-up" style={{ animationDelay: "120ms" }}>
          <QuestionBankPanel quickStartJobs={quickStartCards} />
        </div>

        <div className="fade-in-up" style={{ animationDelay: "180ms" }}>
          <StarStoryMatrix initialStories={starStories} />
        </div>
      </main>
    </>
  );
}
