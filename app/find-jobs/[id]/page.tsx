export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";

import { PostHogIdentify } from "@/components/analytics/PostHogIdentify";
import { CompanyResearch } from "@/components/job-details/CompanyResearch";
import { DocumentGenerator } from "@/components/job-details/DocumentGenerator";
import { JobActions } from "@/components/job-details/JobActions";
import { JobDescription } from "@/components/job-details/JobDescription";
import { JobInfo } from "@/components/job-details/JobInfo";
import { MatchScore } from "@/components/job-details/MatchScore";
import { Navbar } from "@/components/layout/Navbar";
import { ModelSelector } from "@/components/shared/ModelSelector";
import { ThemeSelector } from "@/components/shared/ThemeSelector";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import type { Job, Profile } from "@/types";

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

  const { data: application } = await insforge.database
    .from("applications")
    .select("resume_pdf_url,cover_letter_pdf_url")
    .eq("user_id", user.id)
    .eq("job_id", job.id)
    .maybeSingle<{ resume_pdf_url: string | null; cover_letter_pdf_url: string | null }>();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("preferred_model,preferred_resume_theme")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "preferred_model" | "preferred_resume_theme">>();

  return (
    <>
      <PostHogIdentify userId={user.id} />
      <Navbar isAuthenticated />
      <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[820px] flex-col gap-6 px-4 py-8 sm:px-6 lg:px-0">
        <JobActions applyUrl={applyUrl} company={company} showBackLink />
        <JobInfo job={job} />
        <MatchScore
          matchReason={job.match_reason}
          matchedSkills={job.matched_skills}
          missingSkills={job.missing_skills}
        />
              <JobDescription
                  aboutRole={job.about_role || job.description}
                  responsibilities={job.responsibilities}
                  requirements={job.requirements}
                  niceToHave={job.nice_to_have}
                  benefits={job.benefits}
                  sourceUrl={applyUrl}
              />
        <div className="flex flex-wrap justify-end gap-4">
          <ModelSelector value={profile?.preferred_model ?? "gemini"} />
          <ThemeSelector value={profile?.preferred_resume_theme ?? "modern"} />
        </div>
        <CompanyResearch
          company={company}
          jobId={job.id}
          research={job.company_research}
        />
        <DocumentGenerator
          jobId={job.id}
          resumePdfUrl={application?.resume_pdf_url ?? null}
          coverLetterPdfUrl={application?.cover_letter_pdf_url ?? null}
        />
        <JobActions applyUrl={applyUrl} company={company} showApplyButton />
      </main>
    </>
  );
}
