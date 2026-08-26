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

    // 2. Load the user's last completed search so returning to this page
    // (e.g. "Back to Jobs" from a job's detail page) shows exactly that
    // search — not a fresh blank form on top of the user's entire saved
    // job history, which read as "resetting" every time you navigated back.
    const insforge = await createInsforgeServer();
    const { data: lastRuns } = await insforge.database
        .from("agent_runs")
        .select("id,job_title_searched,location_searched,updated_at")
        .eq("user_id", user.id)
        .neq("status", "running")
        .order("updated_at", { ascending: false })
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
        .select("id,title,company,company_logo_url,match_score,last_viewed_at")
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