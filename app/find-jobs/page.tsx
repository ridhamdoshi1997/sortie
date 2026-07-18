import { requireUser } from "@/lib/auth"; // Ensure this import path is correct for your project
import { createInsforgeServer } from "@/lib/insforge-server";
import { FindJobsForm } from "@/components/find-jobs/FindJobsForm";
import { Navbar } from "@/components/layout/Navbar";

export default async function FindJobsPage() {
    // 1. Fetch the user server-side
    const user = await requireUser();

    // 2. Load existing results server-side so a page refresh or navigating
    // back from a job's detail page doesn't lose the last search — the
    // client form seeds its state from this instead of starting empty.
    const insforge = await createInsforgeServer();
    const { data: initialJobs } = await insforge.database
        .from("jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("found_at", { ascending: false })
        .limit(100);

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
                <FindJobsForm userId={user.id} initialJobs={initialJobs ?? []} />
            </main>
        </>
    );
}