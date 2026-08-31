"use server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { inngest } from "@/lib/inngest/client";
import { searchJobs, filterByCity, type NormalizedJob } from "@/lib/jobScraper";
import { fetchAtsJobs } from "@/lib/atsProviders";
import { fetchJobsForCompany, partitionByKnownAts, toCompanyKey } from "@/lib/atsRegistry";
import { extractLikelyLogoDomain } from "@/lib/applyLinkTrust";
import { createAdminDbClient } from "@/lib/admin/client";
import { checkAndConsumeUsage } from "@/lib/usage";
import { checkJobEvaluationLimit } from "@/lib/subscription";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { unstable_noStore as noStore } from 'next/cache';
import { createClient } from '@insforge/sdk'; //

// Dedup audit finding (build-plan.md §37): the upsert's
// onConflict('user_id,external_id') only catches a repeat SerpApi
// job_id — confirmed via a real production data check that Google Jobs
// itself does NOT return a stable job_id for the same real listing
// across separate search runs (each carries a differently-signed
// htidocid token), so this path alone let the exact same listing get
// re-inserted as a brand new row on every repeat search — one real
// account had up to 11 duplicate rows for a single URL. Fixed with a
// title+company+location fingerprint pre-check: a job whose fingerprint
// already exists for this user gets its existing row refreshed
// (run_id/dropped_from_search_at) instead of a second row inserted.
// Extracted into a shared helper (was inline in scrapeAndEvaluateJobs)
// so scanTargetCompanies() reuses the exact same dedup/upsert path
// instead of a second, divergent copy of it.
function fingerprint(title: string | undefined, company: string | undefined, location: string | undefined): string {
    const norm = (s: string | undefined) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return `${norm(title)}|${norm(company)}|${norm(location)}`;
}

type InsforgeServerClient = Awaited<ReturnType<typeof createInsforgeServer>>;

// How many distinct companies from a single search get polled directly.
// Bounded because a first-time company costs a real ~2s discovery pass;
// once cached in ats_registry that drops to ~100ms, so this ceiling is
// about the worst case, not the steady state. Ordered by how many results
// the company already has, so the biggest employers in a result set — the
// ones a candidate is most likely to care about — are enriched first.
const MAX_DIRECT_ATS_COMPANIES = 8;

async function enrichWithDirectAtsJobs(jobs: NormalizedJob[], searchTitle: string, searchLocation: string): Promise<NormalizedJob[]> {
    if (jobs.length === 0) return jobs;

    const byCompany = new Map<string, { company: string; domain: string | null; count: number }>();
    for (const job of jobs) {
        if (!job.company) continue;
        const key = job.company.toLowerCase().trim();
        const existing = byCompany.get(key);
        if (existing) {
            existing.count++;
            // Keep the first non-null domain we can derive — a job whose
            // own apply link already resolves to the employer's real
            // domain saves a guess entirely.
            existing.domain = existing.domain ?? extractLikelyLogoDomain(job.applyUrl, job.company);
        } else {
            byCompany.set(key, {
                company: job.company,
                domain: extractLikelyLogoDomain(job.applyUrl, job.company),
                count: 1,
            });
        }
    }

    const all = Array.from(byCompany.values());
    if (all.length === 0) return jobs;

    // Service-role client: ats_registry is server-derived reference data
    // with RLS on and zero client policies (same posture as news_items),
    // so the caller's own session client can't read or write it.
    const db = createAdminDbClient() as unknown as Parameters<typeof fetchJobsForCompany>[0];

    // Spend the polling budget on employers already KNOWN to have a real
    // board first — those are instant (cached) and reliably yield direct
    // links — then use whatever budget remains to discover a few new
    // companies, which is how the registry grows itself over time.
    // Sorting purely by result count was a real observed mistake: bulk
    // aggregator rows crowded out TD, whose own Workday board had 20
    // genuinely matching postings.
    const { known } = await partitionByKnownAts(db, all.map((c) => c.company));
    const isKnown = (c: { company: string }) => known.has(toCompanyKey(c.company));
    const targets = [
        ...all.filter(isKnown).sort((a, b) => b.count - a.count),
        ...all.filter((c) => !isKnown(c)).sort((a, b) => b.count - a.count),
    ].slice(0, MAX_DIRECT_ATS_COMPANIES);

    const found = await Promise.all(
        targets.map(async (t) => {
            try {
                return await fetchJobsForCompany(db, t.company, t.domain, searchTitle);
            } catch {
                // Enrichment is strictly additive — a failure here must
                // never fail a search that already has real results.
                return [] as NormalizedJob[];
            }
        })
    );

    // Critical, and a real bug caught live (2026-08-31, direct user
    // report): fetchJobsForCompany pulls a company's board FILTERED BY
    // TITLE ONLY — an employer's ATS board has openings in every city it
    // hires in, not just the one searched. Confirmed via screenshot: a
    // Toronto "advisor" search returned a wall of San Francisco/NYC
    // engineering roles from one enriched company's board. Every other
    // path that can add jobs to a result set already goes through
    // filterByCity (lib/jobScraper.ts) — this was the one that didn't.
    const extra = filterByCity(found.flat(), searchLocation);
    if (extra.length === 0) return jobs;

    // Same title+company dedup key the thin-results merge uses, so a job
    // already present from SerpApi/Adzuna isn't duplicated by its own
    // direct-ATS twin. Direct-ATS entries are appended AFTER the originals
    // so an existing (already-scored, already-linked) job keeps its row.
    const seen = new Set(
        jobs.map((j) => `${(j.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(j.company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`)
    );
    const additions = extra.filter((j) => {
        const key = `${(j.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}|${(j.company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "")}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    if (additions.length > 0) {
        console.warn(`Direct-ATS enrichment added ${additions.length} job(s) from ${targets.length} company board(s).`);
    }
    return [...jobs, ...additions];
}

async function upsertScrapedJobs(
    insforge: InsforgeServerClient,
    userId: string,
    jobs: NormalizedJob[],
    runId: string | null
) {
    const uniqueJobsMap = new Map<string, NormalizedJob>();
    jobs.forEach(job => uniqueJobsMap.set(job.id, job));
    const uniqueJobs = Array.from(uniqueJobsMap.values());

    if (uniqueJobs.length === 0) return [];

    const candidateTitles = Array.from(new Set(uniqueJobs.map(j => j.title).filter(Boolean)));
    const { data: existingByFingerprint } = candidateTitles.length
        ? await insforge.database
            .from("jobs")
            .select("id,title,company,location")
            .eq("user_id", userId)
            .in("title", candidateTitles)
        : { data: [] as { id: string; title: string; company: string; location: string }[] };

    const existingFingerprints = new Map<string, string>();
    for (const row of existingByFingerprint ?? []) {
        existingFingerprints.set(fingerprint(row.title, row.company, row.location), row.id);
    }

    const genuinelyNewJobs: typeof uniqueJobs = [];
    const refreshExistingJobIds: string[] = [];
    for (const job of uniqueJobs) {
        const existingId = existingFingerprints.get(fingerprint(job.title, job.company, job.location));
        if (existingId) {
            refreshExistingJobIds.push(existingId);
        } else {
            genuinelyNewJobs.push(job);
        }
    }

    if (refreshExistingJobIds.length > 0) {
        await insforge.database
            .from("jobs")
            .update({ run_id: runId, dropped_from_search_at: null })
            .in("id", refreshExistingJobIds)
            .eq("user_id", userId);
    }

    const jobsToInsert = genuinelyNewJobs.map(job => ({
        external_id: job.id,
        title: job.title,
        company: job.company,
        location: job.location,
        description: job.description,
        user_id: userId,
        salary: job.salary || null,
        job_type: job.type || null,
        url: job.url || null,
        source: job.source || null,
        external_apply_url: job.applyUrl || null,
        raw_apply_options: job.rawApplyOptions ?? null,
        posted_at: job.postedAt || null,
        company_logo_url: job.logoUrl || null,
        run_id: runId,
        dropped_from_search_at: null,
    }));

    const { data: newlySavedJobs, error } = jobsToInsert.length > 0
        ? await insforge.database
            .from("jobs")
            .upsert(jobsToInsert, { onConflict: 'user_id,external_id' })
            .select('*')
        : { data: [], error: null };

    const { data: refreshedJobs } = refreshExistingJobIds.length > 0
        ? await insforge.database.from("jobs").select("*").in("id", refreshExistingJobIds)
        : { data: [] };

    const savedJobs = [...(newlySavedJobs ?? []), ...(refreshedJobs ?? [])];
    if (error) console.error("❌ INSFORGE UPSERT ERROR:", error);

    return savedJobs;
}

// Sends newly-saved jobs through the AI evaluator, respecting the caller's
// remaining daily quota — jobs beyond it are saved but stay unevaluated
// until the cap resets, same graceful-degradation behavior
// scrapeAndEvaluateJobs already used inline (extracted here so
// scanTargetCompanies() gets the same behavior instead of skipping
// evaluation entirely).
async function evaluateWithinQuota(
    insforge: InsforgeServerClient,
    userId: string,
    userEmail: string | undefined,
    savedJobs: { id: string }[],
    filters: Record<string, string>,
    runId: string | null
) {
    const evaluableJobIds: string[] = [];
    for (const job of savedJobs) {
        const evalCheck = await checkJobEvaluationLimit(insforge, userId, userEmail);
        if (!evalCheck.allowed) break;
        evaluableJobIds.push(job.id);
    }

    if (evaluableJobIds.length > 0) {
        // Real bug found live (2026-08-27): an unreachable Inngest dev
        // server (a separate local process this app depends on — see
        // RESUME.md's own gotcha note) threw here uncaught, which failed
        // the ENTIRE search response even though the jobs above had
        // already saved successfully — a real search silently looked like
        // total failure to the user. Evaluation is a secondary side effect
        // of a search, not the search itself; a failure here should degrade
        // to "saved, not yet scored" (same as the existing quota-exhausted
        // partial-batch path above), never take down jobs the user already
        // has.
        try {
            await inngest.send({
                name: "jobs/evaluate",
                data: { jobIds: evaluableJobIds, filters, userId, runId },
            });
        } catch (error) {
            console.error("[scraper.actions] Failed to trigger evaluation — jobs saved, unscored", error);
        }
    }

    return evaluableJobIds;
}

export type ScrapeBlockedResult = {
    success: false;
    error: string;
    reason?: "daily_cap_reached";
    resetsAt?: string;
    canUpgrade?: boolean;
};

// Quota/rate-limit failures return a structured result instead of throwing
// (2026-08-28) — Next.js Server Actions can mask a thrown Error down to a
// generic message + digest in production, discarding any custom properties
// (reason/resetsAt/canUpgrade) the polished LimitReachedModal needs. Every
// OTHER failure mode below still throws as before (genuinely unexpected —
// network/DB errors — where the existing generic catch-and-toUserMessage
// handling in FindJobsForm.tsx is the right behavior).
export async function scrapeAndEvaluateJobs(
    title: string,
    location: string,
    filters: Record<string, string>,
    userId: string,
): Promise<Awaited<ReturnType<typeof upsertScrapedJobs>> | ScrapeBlockedResult> {
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
        return {
            success: false,
            error: usage.error,
            reason: usage.reason,
            resetsAt: usage.resetsAt,
            canUpgrade: usage.canUpgrade,
        };
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
        rawJobs = await searchJobs(title, location, "ca", "serpapi", filters.date_posted);
    } catch (err) {
        if (runId) {
            await insforge.database.rpc("update_agent_run", {
                p_run_id: runId,
                p_status: "failed",
                p_is_successful: false,
                p_error_message: (err as Error).message,
            });
        }
        throw err;
    }

    // Direct-from-employer enrichment (2026-08-31). The cost-effective
    // route to competitor-grade link quality: an employer's own ATS board
    // is ground truth (a legitimate, specific link by construction, always
    // current) and its public endpoints are FREE and unlimited — unlike
    // every paid aggregator, and unlike TheirStack, which is on a finite
    // 200-credit allowance here and stays reserved for real emergencies.
    // The companies to poll come from the search results we already have,
    // and lib/atsRegistry.ts caches which ATS each one uses globally, so
    // the discovery cost is paid once per company ever (measured: ~2s
    // first time, ~100ms cached) rather than once per search.
    rawJobs = await enrichWithDirectAtsJobs(rawJobs, title, location);

    const uniqueJobsMap = new Map();
    rawJobs.forEach(job => uniqueJobsMap.set(job.id, job));
    const uniqueJobs = Array.from(uniqueJobsMap.values());

    // A genuinely empty search — most commonly a narrow Date Posted filter
    // ("Past 24 hours") for a title/location combo with nothing that fresh —
    // is a real, legitimate outcome, not a failure. Upserting an empty array
    // and then treating "zero rows returned" as an error (below) used to
    // conflate the two; this returns early instead, same "empty state, not
    // an error" principle already applied to SerpApi's own no-results case
    // in lib/jobScraper.ts.
    if (uniqueJobs.length === 0) {
        if (runId) {
            await insforge.database.rpc("update_agent_run", {
                p_run_id: runId,
                p_status: "completed",
                p_is_successful: true,
                p_jobs_found: 0,
            });
        }
        return [];
    }

    console.log("🔍 [Scraper] Unique jobs to insert:", uniqueJobs.length);

    const savedJobs = await upsertScrapedJobs(insforge, userId, uniqueJobs, runId);
    console.log("🔍 [Scraper] Database returned savedJobs:", savedJobs?.length);

    if (!savedJobs || savedJobs.length === 0) {
        if (runId) {
            await insforge.database.rpc("update_agent_run", {
                p_run_id: runId,
                p_status: "failed",
                p_is_successful: false,
                p_error_message: "Insforge upsert did not return any saved jobs.",
            });
        }
        throw new Error("Insforge upsert did not return any saved jobs.");
    }

    if (runId) {
        await insforge.database.rpc("update_agent_run", {
            p_run_id: runId,
            p_jobs_found: savedJobs.length,
        });
        // Status stays "running" — evaluateJobsAsync marks it
        // completed/failed once the Inngest evaluation actually finishes.
    }

    // "Not in the list anymore" detection — cheap and precise, no extra
    // scraping: find this user's PRIOR runs of this exact same (title,
    // location) search (agent_runs.job_title_searched/location_searched are
    // exact strings, not fuzzy-matched, avoiding the "Software Engineer" vs
    // "Software Developer" mismatch problem noted below for jobsToInsert).
    // Any job tied to one of those older runs that isn't in THIS run's
    // result set was returned before and stopped being returned — Google
    // Jobs itself dropped it, the strongest signal this app can get without
    // re-fetching the source site (see lib/jobStatus.ts).
    if (runId) {
        const { data: previousRuns } = await insforge.database
            .from("agent_runs")
            .select("id")
            .eq("user_id", userId)
            .eq("job_title_searched", title)
            .eq("location_searched", location)
            .neq("id", runId)
            .returns<{ id: string }[]>();

        const previousRunIds = (previousRuns ?? []).map((r) => r.id);
        if (previousRunIds.length > 0) {
            const currentJobIds = new Set(savedJobs.map((j) => j.id));
            const { data: previousJobs } = await insforge.database
                .from("jobs")
                .select("id")
                .eq("user_id", userId)
                .in("run_id", previousRunIds)
                .is("marked_unavailable_at", null)
                .is("dropped_from_search_at", null)
                .returns<{ id: string }[]>();

            const droppedIds = (previousJobs ?? [])
                .map((j) => j.id)
                .filter((id) => !currentJobIds.has(id));

            if (droppedIds.length > 0) {
                await insforge.database
                    .from("jobs")
                    .update({ dropped_from_search_at: new Date().toISOString() })
                    .in("id", droppedIds);
            }
        }
    }

    await evaluateWithinQuota(insforge, userId, user?.email, savedJobs, filters, runId);

    // Return the actual saved DB rows (real `id`, not SerpApi's raw id) so
    // the caller can track exactly this search's batch by id, rather than
    // re-matching by title/location text (which drops jobs whose title or
    // location is phrased differently than the search box, e.g. "Software
    // Engineer" vs "Software Developer", or "Markham, ON" vs "Toronto, ON").
    return savedJobs;
}

export type TargetCompanyRow = {
    id: string;
    company_name: string;
    ats_platform: "greenhouse" | "lever" | "ashby" | "smartrecruiters";
    company_slug: string;
    last_scanned_at: string | null;
};

// Phase 8 "Portal Scanner" — scans every company on the current user's
// target_companies watchlist directly via its own ATS's public job-board
// API (lib/atsProviders.ts), instead of going through SerpApi/Google Jobs
// at all. Every apply link that comes back is already the employer's own
// real posting (see atsProviders.ts's own comment), so — unlike
// scrapeAndEvaluateJobs — there's no aggregator/mirror trust question to
// resolve here. Reuses the same upsert/eval-quota helpers above rather
// than a divergent second copy of that logic.
export async function scanTargetCompanies(userId: string) {
    if (!isFeatureEnabled("search")) {
        throw new Error(featureDisabledMessage("search"));
    }

    const insforge = await createInsforgeServer();
    const user = await getCurrentUser();

    const { data: companies, error: companiesError } = await insforge.database
        .from("target_companies")
        .select("id,company_name,ats_platform,company_slug,last_scanned_at")
        .eq("user_id", userId)
        .returns<TargetCompanyRow[]>();

    if (companiesError) throw companiesError;
    if (!companies || companies.length === 0) return [];

    const results = await Promise.all(
        companies.map((c) => fetchAtsJobs(c.ats_platform, c.company_slug, c.company_name))
    );
    const allJobs = results.flat();

    const savedJobs = await upsertScrapedJobs(insforge, userId, allJobs, null);

    await insforge.database
        .from("target_companies")
        .update({ last_scanned_at: new Date().toISOString() })
        .in("id", companies.map((c) => c.id));

    if (savedJobs.length > 0) {
        await evaluateWithinQuota(insforge, userId, user?.email, savedJobs, {}, null);
    }

    return savedJobs;
}

export async function getTargetCompanies(userId: string) {
    noStore();
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
        .from("target_companies")
        .select("id,company_name,ats_platform,company_slug,last_scanned_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .returns<TargetCompanyRow[]>();
    if (error) throw error;
    return data ?? [];
}

export async function addTargetCompany(
    userId: string,
    companyName: string,
    atsPlatform: "greenhouse" | "lever" | "ashby" | "smartrecruiters",
    companySlug: string
) {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("target_companies").insert([{
        user_id: userId,
        company_name: companyName,
        ats_platform: atsPlatform,
        company_slug: companySlug.trim().toLowerCase(),
    }]);
    // Duplicate (user_id, ats_platform, company_slug) is a real, expected
    // outcome (re-adding a company already on the watchlist) — surface it
    // as a normal validation message, not a crash.
    if (error) throw new Error(error.message?.includes("duplicate") ? "This company is already on your watchlist." : error.message);
}

export async function deleteTargetCompany(userId: string, id: string) {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
        .from("target_companies")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
    if (error) throw error;
}

// Refetches a known set of jobs by id — used to poll for match_score
// updates on exactly the batch a search returned, without re-filtering by
// text and silently dropping legitimately relevant results.
export async function getJobsByIds(ids: string[]) {
    noStore();

    const insforge = await createInsforgeServer();

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