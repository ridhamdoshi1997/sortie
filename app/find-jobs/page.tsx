import { requireUser } from "@/lib/auth"; // Ensure this import path is correct for your project
import { createInsforgeServer } from "@/lib/insforge-server";
import { FindJobsForm } from "@/components/find-jobs/FindJobsForm";
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

    return (
        <>
            <Navbar isAuthenticated />
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8">
                {/* 1. Page Header — width-matched to FindJobsForm's own
                    mx-auto max-w-6xl wrapper below, not just this page's
                    outer max-w-7xl <main>. FindJobsForm re-centers itself
                    independently at a narrower max-width for its own visual
                    balance, so without this match the heading's left edge
                    sits further left than the search box's — caught live by
                    direct user report. */}
                <div className="mx-auto flex w-full max-w-6xl flex-col gap-1">
                    <h1 className="fade-in-up text-4xl font-bold tracking-tight text-text-primary">Find & Evaluate</h1>
                    <p className="text-lg text-text-secondary">
                        Source new opportunities and run them through the job search engine.
                    </p>
                </div>

                {/* 2. Pass the user.id and any existing jobs to the form */}
                <FindJobsForm
                    userId={user.id}
                    initialJobs={initialJobs}
                    reappearanceSignals={reappearanceSignals}
                    lastRunAt={lastRunAt}
                    initialTitle={initialTitle}
                    initialLocation={initialLocation}
                />
            </main>
        </>
    );
}