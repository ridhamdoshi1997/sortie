import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { JobResultCard } from "@/components/shared/JobResultCard";
import type { Job } from "@/types";

export default async function SavedJobsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  // Unscoped by run_id, unlike the Find Jobs list — a save should stay
  // visible no matter how many searches happen after it.
  const { data: savedJobs } = await insforge.database
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .eq("is_saved", true)
    .order("found_at", { ascending: false });

  const jobs: Job[] = savedJobs ?? [];

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8">
        <div className="flex flex-col gap-1">
          <h1 className="fade-in-up text-4xl font-bold tracking-tight text-text-primary">Saved Jobs</h1>
          <p className="text-lg text-text-secondary">
            Every job you&apos;ve saved, regardless of which search found it.
          </p>
        </div>

        {jobs.length === 0 ? (
          <p className="text-sm text-text-muted">
            No saved jobs yet — save one from its detail page and it&apos;ll show up here.
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
