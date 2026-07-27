export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { Benefits } from "@/components/job-details/Benefits";
import { CompanyResearch } from "@/components/job-details/CompanyResearch";
import { DocumentGenerator } from "@/components/job-details/DocumentGenerator";
import { EvaluationBreakdown } from "@/components/job-details/EvaluationBreakdown";
import { HiringProcess } from "@/components/job-details/HiringProcess";
import { InsiderConnections } from "@/components/job-details/InsiderConnections";
import { JobActionBar } from "@/components/job-details/JobActionBar";
import { JobDescription } from "@/components/job-details/JobDescription";
import { JobInfo } from "@/components/job-details/JobInfo";
import { MatchScore } from "@/components/job-details/MatchScore";
import { Qualification } from "@/components/job-details/Qualification";
import { Responsibilities } from "@/components/job-details/Responsibilities";
import { ResumeFitSection } from "@/components/job-details/ResumeFitSection";
import { Navbar } from "@/components/layout/Navbar";
import { ModelSelector } from "@/components/shared/ModelSelector";
import { NetworkSignals } from "@/components/shared/NetworkSignals";
import { ThemeSelector } from "@/components/shared/ThemeSelector";
import { Tabs } from "@/components/ui/Tabs";
import { isAdminUser, resolveProvider } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { buildNetworkSearchTerms, findPreviousEmployerMatch } from "@/lib/networkSignals";
import type { Profile } from "@/types";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function JobDetailsPage({ params }: Props) {
  const user = await requireUser();
  const { id } = await params;
  const insforge = await createInsforgeServer();
    const { data: job, error } = await insforge.database
        .from("jobs")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (error) console.error("DB Error:", error);

    if (!job) {
        notFound();
    }

  const company = job.company ?? "this company";
  // external_apply_url/source_url are the originally-designed columns but
  // the scraper (lib/actions/scraper.actions.ts) has only ever written to
  // a separate `url` column — fall back to it so existing saved jobs (all
  // of them, currently) resolve a real apply link instead of showing none.
  const applyUrl = job.external_apply_url ?? job.source_url ?? job.url;
  // No structured work-mode field exists in the source data (confirmed live
  // against a real SerpApi response — only sometimes embedded in free-text
  // titles/locations like "(Hybrid)"), so this is a best-effort text match,
  // not a claim of precision we don't have.
  const isRemote = /\bremote\b/i.test(`${job.title ?? ""} ${job.location ?? ""}`);

  const { data: application } = await insforge.database
    .from("applications")
    .select("resume_pdf_url,cover_letter_pdf_url")
    .eq("user_id", user.id)
    .eq("job_id", job.id)
    .maybeSingle<{ resume_pdf_url: string | null; cover_letter_pdf_url: string | null }>();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("preferred_model,preferred_resume_theme,work_experience,education")
    .eq("id", user.id)
    .maybeSingle<
      Pick<
        Profile,
        "preferred_model" | "preferred_resume_theme" | "work_experience" | "education"
      >
    >();

  const previousEmployer = findPreviousEmployerMatch(
    job.company,
    profile?.work_experience ?? null,
  );
  const networkSearchTerms = buildNetworkSearchTerms(
    profile?.work_experience ?? null,
    profile?.education ?? null,
  );

  const isAdmin = isAdminUser(user.email);
  // Clamp a stale non-Gemini preference (e.g. set before this policy existed,
  // or an admin allowlist change) so the selector never shows/persists a
  // provider a non-admin can no longer actually use.
  const modelValue = resolveProvider(profile?.preferred_model, user.email);

  return (
    <>
      <PostHogIdentify userId={user.id} />
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <JobActionBar
          jobId={job.id}
          applyUrl={applyUrl}
          company={company}
          initialSaved={job.is_saved}
          initialHidden={job.is_hidden}
          postedAt={job.posted_at}
          isRemote={isRemote}
        />
        <JobInfo job={job} />

        <Tabs
          tabs={[
            {
              id: "overview",
              label: "Overview",
              content: (
                <div className="flex flex-col gap-6">
                  <MatchScore
                    matchReason={job.match_reason}
                    evaluation={job.evaluation}
                    recommendationScore={job.recommendation_score}
                  />

                  <EvaluationBreakdown
                    evaluation={job.evaluation ?? []}
                    recommendationScore={job.recommendation_score}
                    overallGrade={job.overall_grade}
                  />

                  <JobDescription
                    aboutRole={job.about_role || job.description}
                    sourceUrl={applyUrl}
                  />

                  <Responsibilities items={job.responsibilities ?? []} />

                  <Qualification
                    jobId={job.id}
                    matchedSkills={job.matched_skills}
                    missingSkills={job.missing_skills}
                    requirements={job.requirements}
                    niceToHave={job.nice_to_have}
                  />

                  <Benefits items={job.benefits ?? []} />

                  <HiringProcess items={job.hiring_process ?? []} />

                  <NetworkSignals
                    company={company}
                    previousEmployer={previousEmployer}
                    searchTerms={networkSearchTerms}
                  />
                </div>
              ),
            },
            {
              id: "company",
              label: "Company",
              content: (
                <div className="flex flex-col gap-6">
                  <CompanyResearch
                    company={company}
                    jobId={job.id}
                    research={job.company_research}
                  />

                  {job.company_research && (
                    <InsiderConnections
                      jobId={job.id}
                      company={company}
                      connections={job.company_research.insiderConnections}
                      lookedUp={job.company_research.insiderConnectionsLookedUp}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />

        <div className="flex flex-wrap justify-end gap-4">
          <ModelSelector value={modelValue} isAdmin={isAdmin} />
          <ThemeSelector value={profile?.preferred_resume_theme ?? "modern"} />
        </div>
        <ResumeFitSection
          jobId={job.id}
          company={company}
          analysis={job.resume_analysis}
        />
        <DocumentGenerator
          jobId={job.id}
          resumePdfUrl={application?.resume_pdf_url ?? null}
          coverLetterPdfUrl={application?.cover_letter_pdf_url ?? null}
        />
      </main>
    </>
  );
}
