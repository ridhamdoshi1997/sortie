import Link from "next/link";
import { Building2 } from "lucide-react";

import { requireUser } from "@/lib/auth"; // Ensure this import path is correct for your project
import { createInsforgeServer } from "@/lib/insforge-server";
import { FindJobsForm } from "@/components/find-jobs/FindJobsForm";
import { RecentlyViewed } from "@/components/find-jobs/RecentlyViewed";
import { Navbar } from "@/components/layout/Navbar";
import { computeReappearanceCounts, getReappearanceSignal, type ReappearanceSignal } from "@/lib/churnSignal";
import type { Job, Profile } from "@/types";

export default async function FindJobsPage() {
    // 1. Fetch the user server-side
    const user = await requireUser();

    // 2. Load the user's last search so returning to this page (e.g. "Back
    // to Jobs" from a job's detail page) shows exactly that search — not a
    // fresh blank form on top of the user's entire saved job history, which
    // read as "resetting" every time you navigated back.
    //
    // Real bug found live (2026-08-27): this used to exclude status=
    // 'running' runs, on the theory that "completed" meant "real, finished
    // search." That's backwards — scrapeAndEvaluateJobs() upserts every job
    // row SYNCHRONOUSLY before AI evaluation is even triggered; 'running'
    // only means scoring hasn't finished yet, not that the jobs aren't real
    // or saved. Evaluation (Inngest, async) commonly still hasn't finished
    // by the time a user opens a job's detail page and presses Back —
    // exactly the moment this query needs to return THAT search — so the
    // exclusion was hiding the just-run search and silently falling back to
    // an older completed one instead, the precise "goes back to default"
    // regression this feature exists to prevent. Unscored jobs already
    // render correctly (FindJobsForm's own polling shows "Scoring…"), so
    // there's no real reason to filter by status here at all.
    //
    // Second real bug found live (2026-08-30), same symptom, different
    // cause: this used to order by updated_at DESC. updated_at only changes
    // when evaluateJobsAsync's Inngest run finally completes/fails — a
    // real, timestamped write, but one that lands whenever that async batch
    // happens to finish, NOT in the order the user actually performed the
    // searches. Real repro: search "advisor" (7 jobs — evaluates fast),
    // then search "developer" (47 jobs — evaluates slower), open a
    // developer job, press Back. If advisor's batch (started earlier,
    // smaller) finishes AFTER developer's batch was created but BEFORE the
    // user presses Back, advisor's updated_at jumps ahead of developer's
    // (still frozen at developer's own creation time, mid-evaluation) —
    // this query then wrongly returns the OLDER "advisor" search. created_at
    // is set once, at the moment the search was actually performed, and
    // never touched again — the correct, stable ordering key for "what did
    // the user search last."
    const insforge = await createInsforgeServer();
    const { data: lastRuns } = await insforge.database
        .from("agent_runs")
        .select("id,job_title_searched,location_searched,updated_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
    const lastRun = lastRuns?.[0] ?? null;
    const lastRunAt = lastRun?.updated_at ?? null;

    // Per direct user request (matching JobRight's onboarding-driven search
    // defaults) — a brand new user with no completed search yet still gets
    // a pre-filled Target role/Target location instead of a blank form, by
    // falling back to the profile's own Job Preferences fields (job_titles_
    // seeking/preferred_locations, filled in via the Profile page — this app
    // has no separate signup questionnaire distinct from that page, so the
    // profile IS the source). Once a real search has run, lastRun always
    // wins — this is only ever a first-visit fallback, never a silent
    // override of what the user actually searched last.
    const { data: profileForDefaults } = await insforge.database
        .from("profiles")
        .select("job_titles_seeking,preferred_locations,location")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "job_titles_seeking" | "preferred_locations" | "location">>();
    const initialTitle = lastRun?.job_title_searched ?? profileForDefaults?.job_titles_seeking?.[0] ?? "";
    const initialLocation =
        lastRun?.location_searched ??
        profileForDefaults?.preferred_locations?.[0] ??
        profileForDefaults?.location ??
        "";

    let initialJobs: Job[] = [];
    if (lastRun) {
        const { data: scopedJobs } = await insforge.database
            .from("jobs")
            .select("*")
            .eq("user_id", user.id)
            .eq("run_id", lastRun.id)
            .eq("is_hidden", false)
            .order("found_at", { ascending: false });
        initialJobs = scopedJobs ?? [];
    }

    // Fallback for jobs saved before `run_id` was tracked on insert, or a
    // brand new user with no completed run yet — show recent history
    // instead of an empty page.
    if (initialJobs.length === 0) {
        const { data: fallbackJobs } = await insforge.database
            .from("jobs")
            .select("*")
            .eq("user_id", user.id)
            .eq("is_hidden", false)
            .order("found_at", { ascending: false })
            .limit(100);
        initialJobs = fallbackJobs ?? [];
    }

    // Reappearing Requisition Signal — needs the user's FULL job history
    // (not just this page's scoped/limited initialJobs) to detect a role
    // resurfacing across separate past searches. A lightweight 3-column
    // fetch, computed once per page load, not per card.
    const { data: allJobsForSignal } = await insforge.database
        .from("jobs")
        .select("company,title,found_at")
        .eq("user_id", user.id);
    const reappearanceCounts = computeReappearanceCounts(allJobsForSignal ?? []);
    const reappearanceSignals: Record<string, ReappearanceSignal> = {};
    for (const job of initialJobs) {
        reappearanceSignals[job.id] = getReappearanceSignal(job, reappearanceCounts);
    }

    // Recently Viewed strip — most-recently-opened job detail pages, not
    // most-recently-found. Separate from initialJobs/lastRun above (that's
    // scoped to one search run; this spans the user's whole history).
    const { data: recentlyViewedJobs } = await insforge.database
        .from("jobs")
        .select("id,title,company,company_logo_url,external_apply_url,match_score,last_viewed_at")
        .eq("user_id", user.id)
        .not("last_viewed_at", "is", null)
        .order("last_viewed_at", { ascending: false })
        .limit(6);

    return (
        <>
            <Navbar isAuthenticated />
            {/* Job-search redesign (2026-08-25, direct user request to
                redesign this page from scratch). The old page stacked THREE
                headers before the search box was reachable: a page h1 +
                subtitle ("Find & Evaluate — Source new opportunities…"), a
                full Recently Viewed strip, then the search card's OWN hero
                (a second 3xl heading + subtitle + p-8/p-12 padding) — on a
                laptop-height viewport the "Execute search" button sat below
                the fold on first load, confirmed live. The page-level
                header and the search card's own hero said the same thing
                twice, so one of them goes: the eyebrow here replaces both,
                the search card keeps its identity but tightens up
                (FindJobsForm.tsx), and Recently Viewed moves below the
                search bar so a returning user reaches "type and search"
                first, sees their recent jobs second. */}
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-8">
                <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
                    <p className="fade-in-up font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                        Jobs · Search &amp; Evaluate
                    </p>
                    <Link
                        href="/find-jobs/companies"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-accent"
                    >
                        <Building2 className="h-3.5 w-3.5" />
                        Company Watchlist
                    </Link>
                </div>

                <FindJobsForm
                    userId={user.id}
                    initialJobs={initialJobs}
                    reappearanceSignals={reappearanceSignals}
                    lastRunAt={lastRunAt}
                    initialTitle={initialTitle}
                    initialLocation={initialLocation}
                />

                <RecentlyViewed jobs={recentlyViewedJobs ?? []} />
            </main>
        </>
    );
}