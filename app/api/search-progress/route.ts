import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import type { Job } from "@/types";

// Live results for a search that is still running.
//
// This exists as a ROUTE HANDLER rather than a Server Action, and that is the
// entire point (2026-09-05). Next.js executes Server Actions from one client
// SEQUENTIALLY: a second action waits for the first to finish. The result poll
// was a Server Action, so every poll queued behind the ~50s scrapeAndEvaluateJobs
// call and could not run until it had already returned — at which point the
// action's own result had populated the list anyway.
//
// So the entire streaming design was dead on arrival in the browser while
// looking perfectly healthy in the server log: jobs really were written at ~15s
// (Indeed) and ~41s (LinkedIn), the poll really did return them, but never
// before the search finished. The reported symptom was exactly that — a
// spinner for the whole search, then every job at once. Every poll line in the
// log sat at 64s, 97s, 103s into a ~50s search, and none below it.
//
// A route handler is a normal fetch and shares no queue with actions, so this
// runs while the search is still in flight.
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ jobs: [] }, { status: 401 });

    const admin = createAdminDbClient();

    const { data: run } = await admin.database
        .from("agent_runs")
        .select("id,started_at")
        .eq("user_id", user.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; started_at: string }>();

    if (!run) return NextResponse.json({ jobs: [] });

    // Only ever serve a genuinely in-flight run, so landing on the page does
    // not repaint the previous search's results — the page is empty by
    // default by design.
    if (Date.now() - new Date(run.started_at).getTime() > 5 * 60_000) {
        return NextResponse.json({ jobs: [] });
    }

    const { data, error } = await admin.database
        .from("jobs")
        .select("*")
        .eq("user_id", user.id)
        .eq("run_id", run.id)
        .eq("is_hidden", false);

    if (error) {
        console.warn("[search-progress] read failed", error);
        return NextResponse.json({ jobs: [] });
    }

    const jobs = (data ?? []) as Job[];
    console.log(
        `[search-progress] run ${run.id.slice(0, 8)} -> ${jobs.length} job(s), ` +
        `${Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000)}s into the search`,
    );
    return NextResponse.json({ jobs });
}
