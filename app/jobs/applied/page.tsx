import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { JobResultCard } from "@/components/shared/JobResultCard";
import type { Job } from "@/types";

export default async function AppliedJobsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: appliedJobs } = await insforge.database
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .eq("application_status", "applied")
    .order("found_at", { ascending: false });

  const jobs: Job[] = appliedJobs ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">Applied</h1>
          <p className="text-base text-text-secondary sm:text-lg">
            Jobs you&apos;ve marked as applied, from a job&apos;s detail page.
          </p>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-text-muted">
            No applications tracked yet — mark a job as applied from its detail page.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {jobs.map((job, index) => (
              <JobResultCard key={job.id} job={job} index={index} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
