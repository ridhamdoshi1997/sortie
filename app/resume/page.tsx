export const dynamic = "force-dynamic";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { ResumeManager } from "@/components/profile/ResumeManager";
import { ApplicationDocumentsCard } from "@/components/profile/ApplicationDocumentsCard";
import { MigrateBaseResumeCard } from "@/components/profile/MigrateBaseResumeCard";
import { hasUnmigratedBaseResume, listResumes } from "@/actions/resumes";
import type { ApplicationStatus } from "@/lib/applicationStatus";

type GeneratedResumeRow = {
  job_id: string;
  cover_letter_pdf_url: string | null;
  jobs: {
    title: string | null;
    company: string | null;
    company_logo_url: string | null;
    application_status: ApplicationStatus | null;
  } | null;
};

export default async function ResumePage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: applications }, resumesResult, showMigratePrompt] = await Promise.all([
    insforge.database
      .from("applications")
      .select("job_id, cover_letter_pdf_url, jobs(title, company, company_logo_url, application_status)")
      .eq("user_id", user.id)
      .not("generated_resume", "is", null)
      .returns<GeneratedResumeRow[]>(),
    listResumes(),
    hasUnmigratedBaseResume(),
  ]);

  const tailored = applications ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full flex-col gap-8 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <div className="flex flex-col gap-1">
          <h1 className="font-display fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Resume</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Manage every résumé slot, sync content with your profile, and keep AI-tailored versions per job.
          </p>
        </div>

        {showMigratePrompt && <MigrateBaseResumeCard />}

        <ResumeManager initialResumes={resumesResult.data ?? []} />

        {tailored.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              AI-tailored per job
            </h2>
            {tailored.map((row) => (
              <ApplicationDocumentsCard
                key={row.job_id}
                jobId={row.job_id}
                title={row.jobs?.title ?? "Tailored resume"}
                company={row.jobs?.company ?? "Unknown company"}
                companyLogoUrl={row.jobs?.company_logo_url ?? null}
                applicationStatus={row.jobs?.application_status ?? "inbox"}
                hasCoverLetter={Boolean(row.cover_letter_pdf_url)}
              />
            ))}
          </div>
        ) : null}
      </main>
    </>
  );
}
