import { requireUser } from "@/lib/auth"; // Ensure this import path is correct for your project
import { createInsforgeServer } from "@/lib/insforge-server";
import { FindJobsForm } from "@/components/find-jobs/FindJobsForm";
import { Navbar } from "@/components/layout/Navbar";

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

    let initialJobs: any[] = [];
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

    return (
        <>
            <Navbar isAuthenticated />
            <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-8">
                {/* 1. Page Header */}
                <div className="flex flex-col gap-1">
                    <h1 className="text-4xl font-bold tracking-tight text-text-primary">Find & Evaluate</h1>
                    <p className="text-lg text-text-secondary">
                        Source new opportunities and run them through the job search engine.
                    </p>
                </div>

                {/* 2. Pass the user.id and any existing jobs to the form */}
                <FindJobsForm
                    userId={user.id}
                    initialJobs={initialJobs}
                    lastRunAt={lastRunAt}
                    initialTitle={lastRun?.job_title_searched ?? ""}
                    initialLocation={lastRun?.location_searched ?? ""}
                />
            </main>
        </>
    );
}