import Link from "next/link";
import { FileText } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";

type GeneratedResumeRow = {
  job_id: string;
  jobs: { title: string | null; company: string | null } | null;
};

export default async function ResumePage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [{ data: profile }, { data: applications }] = await Promise.all([
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
  ]);

  const hasBase = Boolean(profile?.resume_pdf_url);
  const tailored = applications ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Resume</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Your base resume plus every AI-tailored version generated per job.
          </p>
        </div>

        {!hasBase && tailored.length === 0 ? (
          <p className="text-sm text-text-muted">
            No resumes yet — upload one from your{" "}
            <Link href="/profile" className="text-accent hover:underline">
              profile
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-col gap-3">
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
              <a
                key={row.job_id}
                href={`/api/documents/download?jobId=${row.job_id}&kind=resume`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card transition-colors hover:bg-surface-secondary"
              >
                <FileText className="h-5 w-5 text-agent" />
                <div>
                  <p className="text-sm font-semibold text-text-primary">
                    {row.jobs?.title ?? "Tailored resume"}
                  </p>
                  <p className="text-xs text-text-muted">{row.jobs?.company ?? "Unknown company"}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
