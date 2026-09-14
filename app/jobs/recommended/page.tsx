import Link from "next/link";
import { Sparkles } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { Navbar } from "@/components/layout/Navbar";
import { FindJobsForm } from "@/components/find-jobs/FindJobsForm";
import { computeReappearanceCounts, getReappearanceSignal, type ReappearanceSignal } from "@/lib/churnSignal";
import { RECOMMENDED_REFRESH_MS } from "@/lib/recommendedRefresh";
import type { Job, Profile } from "@/types";

// Same 60s budget /find-jobs runs under — this page fires the exact same
// scrapeAndEvaluateJobs work, just with a query it derived instead of one
// the user typed.
export const maxDuration = 60;

// Server Component rendered once per request, where reading the clock is the
// whole point. Named so react-hooks/purity does not flag a bare Date.now() in
// a render body — same workaround app/find-jobs/page.tsx already uses.
function nowMs(): number {
  return Date.now();
}

// "Recommended" (2026-09-10) — the real replacement for the label removed on
// 2026-08-25 for being a false promise (see Navbar.tsx's jobsSubItems
// comment: it pointed at /find-jobs, a manual search form, with nothing
// actually pre-recommended).
//
// Deliberately NOT a second, parallel implementation of the search: it
// renders FindJobsForm itself with the console card hidden and one auto-run
// on mount, so the cards, the relevance ordering, the progressive scoring
// poll, and Save/Hide/Status are all literally the same code path as the
// Search tab. The only difference is where the query comes from — the
// profile's own target roles and locations, never a form on this page.
export default async function RecommendedJobsPage() {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("job_titles_seeking,current_title,preferred_locations,location")
    .eq("id", user.id)
    .maybeSingle<Pick<Profile, "job_titles_seeking" | "current_title" | "preferred_locations" | "location">>();

  // Every role the profile actually names, in the profile's own order, with
  // the current title as a fallback member — this is the dropdown's whole
  // source. Nothing is inferred or invented: a role appears here only
  // because the candidate typed it into their own profile.
  const roleOptions = [
    ...(profile?.job_titles_seeking ?? []),
    ...(profile?.current_title ? [profile.current_title] : []),
  ]
    .map((r) => r?.trim())
    .filter((r): r is string => Boolean(r))
    .filter((r, i, all) => all.findIndex((o) => o.toLowerCase() === r.toLowerCase()) === i);

  const title = roleOptions[0] ?? "";
  const location = profile?.preferred_locations?.[0] ?? profile?.location ?? "";

  // Unlike /find-jobs — which starts empty by explicit product decision so a
  // page load never presents old results as current — this tab SHOULD show
  // what it last recommended. It's a standing feed, not a search you just
  // ran, and re-deriving the same profile query on every visit would spend a
  // real paid search to rebuild a list the user already has. FindJobsForm's
  // autoRun only fires when this comes back empty.
  const { data: recommendedRuns } = await insforge.database
    .from("agent_runs")
    .select("id,created_at")
    .eq("user_id", user.id)
    .eq("job_title_searched", title)
    .order("created_at", { ascending: false })
    .limit(1);
  const lastRun = recommendedRuns?.[0] ?? null;
  const lastRunId = lastRun?.id ?? null;

  // Refresh cadence: once a day, per direct user instruction. Opening this
  // tab five times in an afternoon spends ONE paid search, not five — but a
  // user coming back the next day gets a genuinely fresh scan without
  // touching anything. The Refresh button below covers everything in
  // between.
  const lastRunAt = lastRun?.created_at ?? null;
  // This check only runs when the page renders. A tab left open past the
  // window is FindJobsForm's job — see its visibility/interval re-check.
  const isStale = !lastRunAt || nowMs() - new Date(lastRunAt).getTime() > RECOMMENDED_REFRESH_MS;

  let initialJobs: Job[] = [];
  if (lastRunId) {
    const { data } = await insforge.database
      .from("jobs")
      .select("*")
      .eq("user_id", user.id)
      .eq("run_id", lastRunId)
      .eq("is_hidden", false)
      .returns<Job[]>();
    initialJobs = data ?? [];
  }

  const { data: allJobsForSignal } = await insforge.database
    .from("jobs")
    .select("company,title,found_at")
    .eq("user_id", user.id);
  const reappearanceCounts = computeReappearanceCounts(allJobsForSignal ?? []);
  const reappearanceSignals: Record<string, ReappearanceSignal> = {};
  for (const job of initialJobs) {
    reappearanceSignals[job.id] = getReappearanceSignal(job, reappearanceCounts);
  }

  return (
    <>
      <Navbar isAuthenticated />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <p className="inline-flex w-fit items-center gap-1.5 rounded-full bg-agent-light px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wide text-agent-dark">
            <Sparkles className="h-3.5 w-3.5" />
            Recommended
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold tracking-tight text-text-primary sm:text-4xl">
            Matched to your profile
          </h1>
          <p className="text-base text-text-secondary sm:text-lg">
            {title
              ? `Scanned against your profile — ${title}${location ? ` in ${location}` : ""}. No search to run.`
              : "Add the roles you're targeting to your profile and this fills in on its own."}
          </p>
        </div>

        {!title ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface p-8 text-center">
            <p className="text-sm font-medium text-text-primary">No target roles on your profile yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
              Recommendations come from the roles you&apos;re seeking and where you want to work — nothing
              here until your profile has at least one.
            </p>
            <Link
              href="/profile"
              className="btn-signal mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg px-5 text-sm font-medium text-accent-foreground"
            >
              Complete your profile
            </Link>
          </div>
        ) : (
          <FindJobsForm
            userId={user.id}
            initialJobs={initialJobs}
            reappearanceSignals={reappearanceSignals}
            lastRunAt={lastRunAt}
            initialTitle={title}
            initialLocation={location}
            hideSearchForm
            autoRun
            autoRunStale={isStale}
            showRefreshButton
            roleOptions={roleOptions}
          />
        )}
      </main>
    </>
  );
}
