export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { buildDefaultSections, buildDefaultStyle } from "@/lib/resumeSections";
import { Navbar } from "@/components/layout/Navbar";
import { ResumeWorkspace } from "@/components/documents/ResumeWorkspace";
import type { GeneratedContent } from "@/components/documents/ResumePDF";
import type { Profile, ResumeAnalysis, ResumeGapAnalysisResult } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type ApplicationRow = {
  generated_resume: string | null;
  resume_sections: ResumeSection[] | null;
  resume_style: ResumeStyle | null;
  updated_at: string | null;
  quality_analysis: ResumeAnalysis | null;
  quality_analyzed_at: string | null;
};

export default async function TailoredResumeEditorPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: job }, { data: profile }, { data: application }] = await Promise.all([
    insforge.database
      .from("jobs")
      .select("id,title,company,resume_analysis")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; title: string | null; company: string | null; resume_analysis: ResumeGapAnalysisResult | null }>(),
    insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    insforge.database
      .from("applications")
      .select("generated_resume,resume_sections,resume_style,updated_at,quality_analysis,quality_analyzed_at")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<ApplicationRow>(),
  ]);

  if (!job || !profile) notFound();
  if (!application?.generated_resume) redirect("/resume");

  // Lazily upgrade an older row that predates this feature (only has the
  // pre-editor generated_resume JSON, no resume_sections snapshot yet) — not
  // persisted here (a page render shouldn't write), the first real edit's
  // save action persists it for real.
  const sections =
    application.resume_sections ??
    buildDefaultSections(profile, JSON.parse(application.generated_resume) as GeneratedContent);
  const style = application.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            {job.title ?? "Tailored résumé"}
          </h1>
          <p className="text-sm text-text-secondary">{job.company ?? "Unknown company"}</p>
        </div>

        <ResumeWorkspace
          jobId={jobId}
          profile={profile}
          initialSections={sections}
          initialStyle={style}
          initialResumeAnalysis={job.resume_analysis}
          initialUpdatedAt={application.updated_at}
          initialQualityAnalysis={application.quality_analysis}
          initialQualityAnalyzedAt={application.quality_analyzed_at}
        />
      </main>
    </>
  );
}
