export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { buildDefaultStyle } from "@/lib/resumeSections";
import { Navbar } from "@/components/layout/Navbar";
import { CoverLetterWorkspace } from "@/components/documents/CoverLetterWorkspace";
import { DocumentSwitcher } from "@/components/documents/DocumentSwitcher";
import type { Profile } from "@/types";
import type { ResumeStyle } from "@/types/resumeEditor";

type ApplicationRow = {
  generated_resume: string | null;
  generated_cover_letter: string | null;
  cover_letter_salutation: string | null;
  resume_style: ResumeStyle | null;
  updated_at: string | null;
};

export default async function TailoredCoverLetterEditorPage({
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
      .select("id,title,company")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; title: string | null; company: string | null }>(),
    insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
    insforge.database
      .from("applications")
      .select("generated_resume,generated_cover_letter,cover_letter_salutation,resume_style,updated_at")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<ApplicationRow>(),
  ]);

  if (!job || !profile) notFound();
  // No cover letter generated yet for this job — send back to the
  // job-details page where "Generate" lives, same fallback shape as the
  // résumé workspace's own guard.
  if (!application?.generated_cover_letter) redirect(`/find-jobs/${jobId}`);

  // Shares the tailored résumé's exact style — see CoverLetterPDF.tsx's
  // comment. Falls back to the user's preferred theme default only if no
  // résumé has ever been styled for this job either.
  const style = application.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="fade-in-up text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
              Cover letter — {job.title ?? "this role"}
            </h1>
            <p className="text-sm text-text-secondary">{job.company ?? "Unknown company"}</p>
          </div>
          <DocumentSwitcher jobId={jobId} active="cover_letter" otherExists={Boolean(application.generated_resume)} />
        </div>

        <CoverLetterWorkspace
          jobId={jobId}
          profile={profile}
          company={job.company}
          initialLetterBody={application.generated_cover_letter}
          initialSalutation={application.cover_letter_salutation}
          initialStyle={style}
          initialUpdatedAt={application.updated_at}
        />
      </main>
    </>
  );
}
