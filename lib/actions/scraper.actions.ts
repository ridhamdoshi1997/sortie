"use server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { inngest } from "@/lib/inngest/client";
import { searchJobs } from "@/lib/jobScraper";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@insforge/sdk'; //

export async function scrapeAndEvaluateJobs(title: string, location: string, filters: Record<string, string>, userId: string) {
    if (!isFeatureEnabled("search")) {
        throw new Error(featureDisabledMessage("search"));
    }

    const insforge = await createInsforgeServer();

    // Each search costs a real SerpApi call plus AI evaluation of every
    // result — gate it before spending either, not after.
    const user = await getCurrentUser();

    const rateLimit = await checkRateLimit(insforge, userId, user?.email, "jobs/search");
    if (!rateLimit.allowed) {
        throw new Error(rateLimit.error);
    }

    const usage = await checkAndConsumeUsage(insforge, userId, user?.email, "search");
    if (!usage.allowed) {
        throw new Error(usage.error);
    }

    const { data: run, error: runError } = await insforge.database
        .from("agent_runs")
        .insert([{
            user_id: userId,
            status: "running",
            job_title_searched: title,
            location_searched: location,
            jobs_found: 0,
            started_at: new Date().toISOString(),
        }])
        .select("id")
        .single<{ id: string }>();

    if (runError) console.error("❌ Failed to create agent_run:", runError);
    const runId = run?.id ?? null;

    // Location normalization, canonical-location fallback (for informal
    // names like "Greater Toronto Area"), token-based pagination, and the
    // geographic relevance filter all live in lib/jobScraper.ts — this is
    // the single scraping entry point, not a second copy of that logic.
    let rawJobs;
    try {
        rawJobs = await searchJobs(title, location, "ca", "serpapi");
    } catch (err) {
        if (runId) {
            await insforge.database
                .from("agent_runs")
                .update({
                    status: "failed",
                    is_successful: false,
                    error_message: (err as Error).message,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", runId);
        }
        throw err;
    }

    const uniqueJobsMap = new Map();
    rawJobs.forEach(job => uniqueJobsMap.set(job.id, job));
    const uniqueJobs = Array.from(uniqueJobsMap.values());

    // 1. DEBUG: Check what we are trying to insert
    console.log("🔍 [Scraper] Unique jobs to insert:", uniqueJobs.length);
    if (uniqueJobs.length > 0) console.log("🔍 [Scraper] First job example:", uniqueJobs[0]);

    const jobsToInsert = uniqueJobs.map(job => ({
        external_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        user_id: userId,
        salary: job.salary || null,
        job_type: job.type || null,
        url: job.url || null,
        external_apply_url: job.applyUrl || null,
        // Never actually set anywhere before — needed so a later page load
        // can scope "my last search" to exactly this batch instead of
        // showing the user's entire saved-job history.
        run_id: runId,
    }));

    const { data: savedJobs, error } = await insforge.database
        .from("jobs")
        .upsert(jobsToInsert, { onConflict: 'external_id' })
        .select('*');

    // 2. DEBUG: Check what the database actually returned
    console.log("🔍 [Scraper] Database returned savedJobs:", savedJobs?.length);
    if (error) console.error("❌ INSFORGE UPSERT ERROR:", error);

    if (!savedJobs || savedJobs.length === 0) {
        if (runId) {
            await insforge.database
                .from("agent_runs")
                .update({
                    status: "failed",
                    is_successful: false,
                    error_message: "Insforge upsert did not return any saved jobs.",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", runId);
        }
        throw new Error("Insforge upsert did not return any saved jobs.");
    }

    if (runId) {
        await insforge.database
            .from("agent_runs")
            .update({ jobs_found: savedJobs.length })
            .eq("id", runId);
        // Status stays "running" — evaluateJobsAsync marks it
        // completed/failed once the Inngest evaluation actually finishes.
    }

    await inngest.send({
        name: "jobs/evaluate",
        data: {
            jobIds: savedJobs.map(j => j.id), // Ensure these are valid DB IDs
            filters,
            userId,
            runId,
        },
    });

    // Return the actual saved DB rows (real `id`, not SerpApi's raw id) so
    // the caller can track exactly this search's batch by id, rather than
    // re-matching by title/location text (which drops jobs whose title or
    // location is phrased differently than the search box, e.g. "Software
    // Engineer" vs "Software Developer", or "Markham, ON" vs "Toronto, ON").
    return savedJobs;
}

// Refetches a known set of jobs by id — used to poll for match_score
// updates on exactly the batch a search returned, without re-filtering by
// text and silently dropping legitimately relevant results.
export async function getJobsByIds(ids: string[]) {
    noStore();

    const insforge = createClient({
        baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
        anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY!,
    });

    const { data, error } = await insforge.database
        .from('jobs')
        .select('*')
        .in('id', ids);

    if (error) throw error;
    return data;
}

// Update this function to accept the title and location filters
export async function getUserJobs(userId: string, title?: string, location?: string) {
    noStore(); // 🛑 Disables Next.js caching for this function

    const insforge = createClient({
        baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!, //
        anonKey: process.env.NEXT_PUBLIC_INSFORGE_ANON_KEY! //
    });

    let query = insforge.database
        .from('jobs')
        .select('*')
        .eq('user_id', userId);

    if (title) query = query.ilike('title', `%${title}%`);
    if (location) query = query.ilike('location', `%${location}%`);

    const { data, error } = await query;
    if (error) throw error;
    return data;
}