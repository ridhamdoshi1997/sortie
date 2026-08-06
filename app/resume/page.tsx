export const dynamic = "force-dynamic";

import { FileText } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { ResumeManager } from "@/components/profile/ResumeManager";
import { TailoredResumeCard } from "@/components/profile/TailoredResumeCard";
import { listResumes } from "@/actions/resumes";

type GeneratedResumeRow = {
  job_id: string;
  jobs: { title: string | null; company: string | null } | null;
};

export default async function ResumePage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: profile }, { data: applications }, resumesResult] = await Promise.all([
    insforge.database
      .from("profiles")
      .select("resume_pdf_url")
      .eq("id", user.id)
      .maybeSingle<{ resume_pdf_url: string | null }>(),
    insforge.database
      .from("applications")
      .select("job_id, jobs(title, company)")
      .eq("user_id", user.id)
      .not("generated_resume", "is", null)
      .returns<GeneratedResumeRow[]>(),
    listResumes(),
  ]);

  const hasBase = Boolean(profile?.resume_pdf_url);
  const tailored = applications ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8" style={{ width: "100%" }}>
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Resume</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Manage every résumé slot, sync content with your profile, and keep AI-tailored versions per job.
          </p>
        </div>

        <ResumeManager initialResumes={resumesResult.data ?? []} />

        {hasBase || tailored.length > 0 ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">
              AI-tailored per job
            </h2>
            {hasBase && (
              <a
                href="/api/resume/download"
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-secondary"
              >
                <FileText className="h-5 w-5 text-accent" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">Base resume</p>
                  <p className="text-xs text-text-muted">Uploaded to your profile</p>
                </div>
              </a>
            )}
            {tailored.map((row) => (
              <TailoredResumeCard
                key={row.job_id}
                jobId={row.job_id}
                title={row.jobs?.title ?? "Tailored resume"}
                company={row.jobs?.company ?? "Unknown company"}
              />
            ))}
          </div>
        ) : null}
      </main>
    </>
  );
}
