import Link from "next/link";
import { Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { RecommendedJobCard } from "@/components/jobs/RecommendedJobCard";
import { getRecommendedJobs } from "@/lib/jobRecommendations";

export const maxDuration = 30;

type ProfileRow = {
  job_titles_seeking: string[] | null;
  current_title: string | null;
  skills: string[] | null;
  preferred_locations: string[] | null;
  location: string | null;
};

// "Recommended" (2026-09-10) — real replacement for the label that was
// renamed away on 2026-08-25 because it was a false promise back then (see
// components/layout/Navbar.tsx's own comment on jobsSubItems): "Recommended"
// used to point at /find-jobs, a manual search form with nothing actually
// pre-recommended. This tab is the real thing — built from the profile's
// own target titles/skills/locations, no search box, just the listings.
export default async function RecommendedJobsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("job_titles_seeking,current_title,skills,preferred_locations,location")
    .eq("id", user.id)
    .maybeSingle<ProfileRow>();

  const { jobs, searchedTitles, hasSignal } = await getRecommendedJobs({
    jobTitlesSeeking: profile?.job_titles_seeking ?? null,
    currentTitle: profile?.current_title ?? null,
    skills: profile?.skills ?? null,
    preferredLocations: profile?.preferred_locations ?? null,
    location: profile?.location ?? null,
  });

  return (
    <>
      <Navbar />
      <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <Sparkles className="h-3.5 w-3.5" />
            Recommended
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-text-primary sm:text-3xl">
            Jobs matched to your profile
          </h1>
          {hasSignal ? (
            <p className="text-sm text-text-secondary">
              Pulled from {searchedTitles.map((t) => `"${t}"`).join(", ")} — from your profile, not a search you ran.
            </p>
          ) : (
            <p className="text-sm text-text-secondary">
              Add the roles you&apos;re targeting to your profile and this tab fills in on its own.
            </p>
          )}
        </div>

        {!hasSignal ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-medium text-text-primary">No target roles on your profile yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
              Recommended jobs come from the roles you&apos;re seeking and your skills — nothing here until your
              profile has at least one.
            </p>
            <Link
              href="/profile"
              className="btn-signal mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
            >
              Complete your profile
            </Link>
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-medium text-text-primary">Nothing matched yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
              We didn&apos;t find anything in our index for{" "}
              {searchedTitles.map((t) => `"${t}"`).join(", ")} right now. Run a search on the Search tab for a
              broader, live pull.
            </p>
            <Link
              href="/find-jobs"
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-5 text-sm font-medium text-text-secondary hover:bg-surface-secondary"
            >
              Go to Search
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {jobs.map((job) => (
              <RecommendedJobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
