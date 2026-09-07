"use server";

import { createInsforgeServer } from "@/lib/insforge-server";
import { getCurrentUser } from "@/lib/auth";
import { inngest } from "@/lib/inngest/client";
import { searchJobs, filterByCity, filterByTitleRelevance, type NormalizedJob } from "@/lib/jobScraper";
import { fetchAtsJobs } from "@/lib/atsProviders";
import { fetchJobsForCompany, partitionByKnownAts, toCompanyKey } from "@/lib/atsRegistry";
import { canonicalizeJobSources } from "@/lib/jobCanonicalization";
import { harvestEmployers } from "@/lib/atsDiscoveryHarvest";
import { queryProactiveCrawlCache } from "@/lib/proactiveAtsCrawl";
import { preFilterJob } from "@/lib/jobPreFilter";
import { rankJobsByRelevance } from "@/lib/jobRelevance";
import type { Job, Profile } from "@/types";
import { extractLikelyLogoDomain, classifyApplyHost } from "@/lib/applyLinkTrust";
import { looksLikeSpecificJobPosting, verifyApplyLinksBeforeReveal } from "@/lib/reresolveApplyLink";
import { createAdminDbClient, createCacheDbClient } from "@/lib/admin/client";
import { checkAndConsumeUsage } from "@/lib/usage";
import { checkJobEvaluationLimit } from "@/lib/subscription";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { isAdminUser } from "@/lib/access";
import { unstable_noStore as noStore } from 'next/cache';
import { after } from 'next/server';

type InsforgeServerClient = Awaited<ReturnType<typeof createInsforgeServer>>;

// Split into two budgets (2026-09-03) after measuring that one shared cap of
// 8 was the wrong shape. The two kinds of company cost wildly different
// amounts: an employer already in ats_registry is a cached lookup plus one
// board fetch (~100ms), while an unknown one pays a real ~2s discovery pass.
// Sharing a single budget between them meant a search could spend most of
// its allowance discovering three new companies and poll almost none of the
// employers we already knew how to reach.
//
// Measured on "Software Engineer"/Toronto (73 companies in the result set,
// 35 already known):
//   current cap of 8, mixed : 1.3s, 106 fetched,  34 after the city filter
//   all 35 known companies  : 5.5s, 383 fetched,  75 after the city filter
// Direct-employer results — the highest trust tier there is — more than
// doubled. On "Financial Advisor"/Toronto the known-only pass was also
// FASTER than the old mixed cap (1.7s vs 5.0s) because it stopped paying
// for discovery mid-search.
//
// So: poll many known employers, and keep discovery of new ones deliberately
// small. Discovery's real value is growing the registry for every FUTURE
// search (and for the proactive crawl), not this one, so it doesn't deserve
// to spend a candidate's latency budget.
const MAX_KNOWN_ATS_COMPANIES = 30;
const MAX_UNKNOWN_ATS_DISCOVERIES = 3;

// One slow or hanging board must not stall the whole search. Everything here
// runs concurrently, so this bounds the worst case rather than the total:
// without it a single unresponsive employer holds up every other result.
const ATS_FETCH_TIMEOUT_MS = 6000;

// Raised 80 -> 150 (2026-09-03, direct product decision) once the pipeline
// started producing far more than 80 real candidates: a "Software Engineer"/
// Toronto search now yields 200 unique candidates, and at 80 the trim was
// discarding every single one of Adzuna's 84 results, because direct-ATS
// jobs rank first by trust tier and filled the entire cap. Losing a whole
// source is too blunt an outcome when that source reaches employers who
// aren't on any ATS platform we cover.
//
// Sized against what the cap actually costs, which is TIME more than money.
// Scoring runs in chunks of 10 jobs per AI call (evaluateJobsAsync) behind a
// GLOBAL 12-calls-per-60s throttle shared by every user. Because the
// throttle is a per-window gate, cost is a step function, not a slope --
// what matters is how many 60s windows the call count spans:
//    120 jobs = 12 calls = exactly ONE window
//    150 jobs = 15 calls = spills into a SECOND window (+60s)
//
// 120, down from 150 (2026-09-04). The 150 was set while chunk size was
// still 5 (the comment here computed 30 calls, and was never updated when
// Phase 45 raised chunks 5 -> 10 specifically to halve call count). Those
// two changes silently cancelled: call count went 8 -> 15 and landed back
// over the window boundary, re-adding the ~60s the chunk-size fix had just
// removed. 120 keeps the whole search inside one window.
//
// Jobs are VISIBLE immediately either way -- only the scores stream in
// progressively -- and lib/jobRelevance.ts already orders evaluation so the
// most relevant jobs are scored first, which matters more at this size.
//
// Deliberately NOT unbounded: the throttle is global, so one large search
// consumes capacity every other user's search is waiting on.
const MAX_EVALUATED_JOBS = 120;

// Matches the research-settled "top 15-20" figure for a relevance
// pre-filter — see rankJobsByRelevance's own use site comment. Only
// changes evaluation ORDER when a search has more not-yet-scored jobs
// than this; below the threshold, everything just gets evaluated as
// before.
const RELEVANCE_TOP_N = 20;

// Paid-sources-only switch (2026-09-07, direct product request: "turn off
// showing all the crawl or in-db jobs other than coming from apify").
//
// A search normally merges three things: the Apify providers (LinkedIn and
// Indeed), reactive direct-ATS enrichment of employers those results mention,
// and the proactive crawl cache. This turns the last two off, leaving only what
// the paid providers returned, so the two can be compared honestly on volume
// and relevance.
//
// An env switch rather than deleted code: it is meant to be flipped back, and
// deleting the crawl integration to answer a question would be a lot to undo.
// Unset behaves exactly as before.
const APIFY_ONLY_SEARCH = process.env.SEARCH_APIFY_ONLY === "1";

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
    // Two separate budgets, not one shared cap — see the constants' own
    // comment for the measurements behind this.
    const targets = [
        ...all.filter(isKnown).sort((a, b) => b.count - a.count).slice(0, MAX_KNOWN_ATS_COMPANIES),
        ...all.filter((c) => !isKnown(c)).sort((a, b) => b.count - a.count).slice(0, MAX_UNKNOWN_ATS_DISCOVERIES),
    ];

    const found = await Promise.all(
        targets.map(async (t) => {
            try {
                // Raced against a timeout rather than awaited outright: these
                // run concurrently, so one unresponsive employer would
                // otherwise hold the entire search open.
                return await Promise.race([
                    fetchJobsForCompany(db, t.company, t.domain, searchTitle),
                    new Promise<NormalizedJob[]>((resolve) => setTimeout(() => resolve([]), ATS_FETCH_TIMEOUT_MS)),
                ]);
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

    // No dedup here anymore (2026-08-31) — this used to run its own
    // title+company Set-based check against `jobs`, a DIFFERENT and
    // weaker key than the real per-user dedup fingerprint used everywhere
    // else (lib/jobCanonicalization.ts's canonical_key), normalized
    // differently and missing location entirely. That inconsistency was
    // the exact bug this migration/module closes: the same real job could
    // dedupe correctly in one path and slip through as a duplicate here.
    // upsertScrapedJobs now runs every job from every source (SerpApi,
    // Adzuna, and these ATS additions) through the SAME canonicalization
    // path, so a direct-ATS job matching an already-present SerpApi job
    // merges into one row there — atomically, safe even when both land in
    // the same search — rather than needing to be pre-filtered here.
    console.log(`Direct-ATS enrichment found ${extra.length} job(s) from ${targets.length} company board(s).`);
    return [...jobs, ...extra];
}

// Rewritten 2026-08-31 onto lib/jobCanonicalization.ts's atomic
// merge_job_source RPC (see migrations/20260831233851_add-job-canonicalization.sql)
// — replaces the old title+company+location fingerprint pre-check
// (app-level SELECT then INSERT-or-UPDATE) with a single DB-atomic upsert
// per job, keyed on the same canonical_key EVERY ingestion path now
// shares (SerpApi, Adzuna, and enrichWithDirectAtsJobs's ATS additions —
// no more separate, weaker in-search dedup for that path). Also fixes
// first-seen-data-wins-forever: a higher-priority source (direct ATS)
// found later now upgrades an already-stored job's title/description/
// apply_url in place, where the old refresh path only ever touched
// run_id/dropped_from_search_at.
//
// Runs on the admin client, not the caller's session client — matches
// enrichWithDirectAtsJobs's own ats_registry access and
// evaluateJobsAsync's writes to jobs, both already admin-client-only for
// the same reason (this is atomic-merge/reference-data machinery, not a
// plain per-request user write).
async function upsertScrapedJobs(
    userId: string,
    jobs: NormalizedJob[],
    runId: string | null
) {
    if (jobs.length === 0) return [];

    const admin = createAdminDbClient();
    return canonicalizeJobSources(
        admin,
        userId,
        runId,
        jobs.map((job) => ({ sourceType: job.source, job })),
    );
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
    savedJobs: { id: string; match_score?: number | null; title?: string | null; company?: string | null; description?: string | null; salary?: string | null; posted_at?: string | null; source?: string | null }[],
    filters: Record<string, string>,
    runId: string | null
): Promise<{ hiddenIds: string[] }> {
    // Phase 2 pre-filter (2026-08-31) — cheap heuristics reject obvious
    // junk (staffing agencies, near-empty scrapes, spam phrasing) before it
    // ever reaches the expensive LLM evaluation, for free. Sets
    // is_hidden=true, the SAME column the find-jobs page's own query
    // already filters on (.eq("is_hidden", false)) — no UI change needed,
    // a pre-filtered job is simply never shown, not labeled with a
    // warning. hiddenIds is returned so the caller can also exclude these
    // from what it hands straight back to the client for this search's own
    // immediate response, not just from future page loads.
    const hiddenIds: string[] = [];
    const passesPreFilter: typeof savedJobs = [];
    for (const job of savedJobs) {
        const result = preFilterJob(job);
        if (result.hide) {
            hiddenIds.push(job.id);
            console.log(`[evaluateWithinQuota] pre-filtered "${job.title}" — ${result.reason}`);
        } else {
            passesPreFilter.push(job);
        }
    }
    if (hiddenIds.length > 0) {
        await insforge.database.from("jobs").update({ is_hidden: true }).in("id", hiddenIds).eq("user_id", userId);
    }

    // Real bug found live (2026-08-31, direct user report): savedJobs from
    // upsertScrapedJobs includes every REFRESHED job too (an existing job
    // matched by fingerprint on a repeat search — see that function's own
    // comment), each already carrying its real match_score from a prior
    // evaluation. This function used to queue ALL of them for evaluation
    // with no check for "already scored" — meaning simply repeating the
    // exact same search (same title+location) silently re-ran the full
    // expensive LLM rubric on every job that was already scored, for zero
    // new information. That's real, wasted AI spend AND — as of the same
    // incident — extra pressure on the shared rate-limited free Gemini key
    // (see evaluateJobChunk's throttle in lib/inngest/functions.ts) on top
    // of whatever the search's genuinely new jobs already needed. A search
    // should only ever spend its evaluation budget on jobs that don't
    // already have a real score.
    const needsEvaluation = passesPreFilter.filter((job) => job.match_score === null || job.match_score === undefined);

    // Relevance pre-filter (2026-08-31 research day) — when a search
    // returns more not-yet-scored jobs than this, prioritize the ones most
    // relevant to the candidate's own real skills/desired titles first,
    // using the full-text search infrastructure already built for global
    // search (lib/jobRelevance.ts) instead of an embeddings API. Jobs
    // beyond RELEVANCE_TOP_N still get saved and are still evaluable
    // later (a future search, a manual "Score this job" click) — this
    // only decides evaluation ORDER when there's more supply than a
    // single search's evaluation budget, it never permanently excludes a
    // job the way the Phase 2 pre-filter's is_hidden does.
    let orderedForEvaluation = needsEvaluation;
    if (needsEvaluation.length > RELEVANCE_TOP_N) {
        const { data: profileForRelevance } = await insforge.database
            .from("profiles")
            .select("skills,job_titles_seeking")
            .eq("id", userId)
            .maybeSingle<Pick<Profile, "skills" | "job_titles_seeking">>();

        if (profileForRelevance) {
            const rankedIds = await rankJobsByRelevance(
                insforge,
                needsEvaluation.map((j) => j.id),
                profileForRelevance,
            );
            const byId = new Map(needsEvaluation.map((j) => [j.id, j]));
            orderedForEvaluation = rankedIds.map((id) => byId.get(id)).filter((j): j is (typeof needsEvaluation)[number] => Boolean(j));
        }
    }

    const evaluableJobIds: string[] = [];
    for (const job of orderedForEvaluation) {
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

    return { hiddenIds };
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
    // Started BEFORE the paid providers, not after them.
    //
    // This lookup needs only the title and location -- it has never had any
    // dependency on the aggregator results -- yet it sat third in a
    // strictly sequential chain (providers -> enrichment -> cache), so its
    // seconds were added to a wait already dominated by the ~43s LinkedIn
    // actor. Kicking it off here overlaps it entirely with that wait.
    //
    // Not awaited here on purpose: an early await would simply move the
    // blocking, not remove it. The promise is consumed further down, by
    // which point it has almost always already resolved. Rejections are
    // caught at the consumption site, and a floating rejection cannot
    // escape because .catch is attached immediately below.
    const cachedJobsPromise = (async () => {
        if (APIFY_ONLY_SEARCH) return [] as NormalizedJob[];
        try {
            // The cache lives in its own Supabase project -- see
            // createCacheDbClient. Falls back to the main project when
            // CACHE_SUPABASE_* is unset, so this keeps working unchanged on a
            // checkout without those secrets.
            const cacheDb = createCacheDbClient() as unknown as Parameters<typeof queryProactiveCrawlCache>[0];
            return await queryProactiveCrawlCache(cacheDb, title, location);
        } catch (error) {
            console.warn("[scraper.actions] proactive-crawl cache lookup failed", error);
            return [] as NormalizedJob[];
        }
    })();

    // Cache-first serving (2026-09-04). Overlapping the lookup with the
    // providers (above) removed its seconds from the total, but the user
    // still saw nothing until the whole chain finished — a wait dominated
    // by the ~43s LinkedIn actor. These jobs are already in our own
    // database and cost nothing to serve, so there is no reason to hold
    // them behind a paid provider that has not answered yet.
    //
    // Upserting here, against the run_id created above, is what makes them
    // visible early: getInFlightSearchJobs (below) polls this run while
    // this action is still executing, so rows land on screen seconds in
    // rather than at the end. Not awaited — awaiting would reintroduce
    // exactly the blocking this removes — but the main upsert below DOES
    // await it, so the two never race into merge_job_source together.
    //
    // Filtered and capped the same way the main path filters and caps, so
    // an early row is never one the full pass would have rejected. It is
    // NOT pre-filtered (preFilterJob runs later, inside evaluateWithinQuota)
    // — an early row that the pre-filter later hides can therefore show for
    // a few seconds before disappearing. Accepted: the poll re-reads
    // is_hidden every cycle, so it self-corrects without a page load.
    const earlyCacheUpsert = cachedJobsPromise
        .then(async (cached) => {
            if (cached.length === 0) return;
            const relevant = filterByTitleRelevance(cached, title).slice(0, MAX_EVALUATED_JOBS);
            if (relevant.length === 0) return;
            await upsertScrapedJobs(userId, relevant, runId);
            console.log(`[scraper] cache-first: ${relevant.length} job(s) on screen before providers finished`);
        })
        .catch((error) => {
            console.warn("[scraper.actions] cache-first early upsert failed", error);
        });

    // Phase timing (2026-09-05, direct user report that a search "takes like
    // a minute"). Every number a latency decision gets made on should come
    // from a real search rather than a bench harness, so each phase logs its
    // own wall-clock and the end logs the breakdown. Cheap enough to leave
    // in: five Date.now() calls and one line per search.
    const tStart = Date.now();
    const phase: Record<string, number> = {};

    let rawJobs;
    // Declared out here, not inside the try: the authoritative upsert below
    // has to await these before it starts writing the same rows.
    const streamedUpserts: Promise<void>[] = [];
    try {
        const tProviders = Date.now();
        // Each provider's results are written against this run the moment
        // THAT provider finishes, rather than all of them after the slowest
        // one. Measured: providers take ~46s together because LinkedIn does,
        // while Indeed answers in roughly ten — so Indeed's results used to
        // sit fetched-and-idle for ~35s waiting on a source they do not
        // depend on.
        //
        // This replaces the crawl cache as the thing that makes a search feel
        // instant. Cache-first still runs and is still faster when it hits,
        // but it only hits when our own crawl happens to hold matching
        // postings — on a real "Financial Advisor"/Toronto run it contributed
        // nothing, and the whole fast path silently degraded to "wait for
        // everything". Provider streaming has no such dependency: whatever
        // the search actually found shows up as soon as it exists.
        rawJobs = await searchJobs(title, location, "ca", "serpapi", filters.date_posted, (sourceName, jobs) => {
            streamedUpserts.push(
                (async () => {
                    try {
                        const relevant = filterByTitleRelevance(jobs, title).slice(0, MAX_EVALUATED_JOBS);
                        if (relevant.length === 0) return;
                        await upsertScrapedJobs(userId, relevant, runId);
                        console.log(
                            `[scraper] streamed ${relevant.length} ${sourceName} job(s) on screen at ` +
                            `${Date.now() - tStart}ms, before the search finished`,
                        );
                    } catch (error) {
                        // Streaming is an accelerant, never a dependency: the
                        // authoritative upsert below writes these same jobs.
                        console.warn(`[scraper] streamed upsert for ${sourceName} failed`, error);
                    }
                })(),
            );
        });
        phase.providers = Date.now() - tProviders;
        console.log(`[scraper:timing] providers ${phase.providers}ms -> ${rawJobs.length} jobs`);
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
    const tEnrich = Date.now();
    if (!APIFY_ONLY_SEARCH) {
        rawJobs = await enrichWithDirectAtsJobs(rawJobs, title, location);
    }
    phase.atsEnrichment = Date.now() - tEnrich;
    console.log(`[scraper:timing] direct-ATS enrichment ${phase.atsEnrichment}ms -> ${rawJobs.length} jobs${APIFY_ONLY_SEARCH ? " (SKIPPED — SEARCH_APIFY_ONLY=1)" : ""}`);

    // Proactive-crawl cache supplement (2026-09-01) — the volume-gap fix
    // RESUME.md's redesign flagged as the actual lever, not just "add more
    // real-time aggregators": enrichWithDirectAtsJobs above can only poll a
    // company THIS search's own SerpApi/Adzuna results already surfaced.
    // This instead pulls whatever the background proactive crawl
    // (lib/proactiveAtsCrawl.ts, lib/inngest/functions.ts's
    // proactiveAtsCrawlAsync) has ALREADY cached for ANY company matching
    // this search's title, regardless of whether it showed up in this
    // particular aggregator batch. Free (no live HTTP call, no paid API) —
    // the crawl already paid for it on its own schedule. Additive only,
    // deduped below same as every other source; a failure here (RLS/DB
    // hiccup) must never fail a search that already has real results.
    try {
        // Already in flight since before the provider fetch above.
        const cached = await cachedJobsPromise;
        if (cached.length > 0) {
            console.log(`Proactive-crawl cache supplied ${cached.length} additional job(s).`);
            rawJobs = [...rawJobs, ...cached];
        }
    } catch (error) {
        console.warn("[scraper.actions] proactive-crawl cache lookup failed", error);
    }

    const uniqueJobsMap = new Map();
    rawJobs.forEach(job => uniqueJobsMap.set(job.id, job));
    let uniqueJobs = Array.from(uniqueJobsMap.values());

    // Title relevance, applied to EVERY source at once (2026-09-03, direct
    // user report of Directors/Engineers/Developers coming back for a
    // "Financial Advisor" search — measured at 77% noise on that run).
    // Deliberately placed HERE, before the MAX_EVALUATED_JOBS trim rather
    // than after: the trim ranks purely by apply-link trust, so leaving the
    // noise in meant irrelevant postings consumed slots that relevant ones
    // needed AND then cost a real AI evaluation call each. Filtering first
    // means the cap is spent entirely on jobs that actually match the
    // search. See filterByTitleRelevance in lib/jobScraper.ts for the rule
    // and why Adzuna's own title_only parameter wasn't used instead.
    const beforeRelevance = uniqueJobs.length;
    uniqueJobs = filterByTitleRelevance(uniqueJobs, title);
    if (beforeRelevance !== uniqueJobs.length) {
        console.log(`[scraper] title relevance: ${beforeRelevance} -> ${uniqueJobs.length} for "${title}"`);
    }

    // Real regression found live (2026-08-31, direct user report — a
    // search stuck at "Scoring 0 of 118" was actually progressing at
    // ~1 job/26s, meaning a full 125-job batch would take close to an
    // hour): nothing capped total volume after the Adzuna supplement and
    // direct-ATS enrichment shipped the same day, both additive on top of
    // SerpApi's own ~30-80 typical results. AI evaluation cost/time scales
    // with job count, so 2-3x'ing the result set without a cap directly
    // caused this. MAX_EVALUATED_JOBS restores a sane per-search ceiling
    // — matching the volume the evaluation pipeline was actually tuned
    // for — while keeping the highest-value jobs: sorted so a real,
    // specific employer/ATS link always survives the cut before a
    // major-board or low-quality one does, so trimming quantity doesn't
    // also trim the quality this session's other work just improved.
    //
    // Skipped entirely for admin/owner/testing accounts (direct request,
    // 2026-09-01) — same isAdminUser allowlist every quota/rate-limit
    // check in this codebase already exempts (checkAndConsumeUsage,
    // checkJobEvaluationLimit, checkRateLimit), extended here to this cap
    // too so testing the real, uncapped scope of a search isn't itself
    // capped.
    if (!isAdminUser(user?.email) && uniqueJobs.length > MAX_EVALUATED_JOBS) {
        const rank = (j: NormalizedJob) => {
            const trust = j.applyUrl ? classifyApplyHost(j.applyUrl, j.company) : "unverified";
            if (trust === "ats" || (trust === "employer" && j.applyUrl && looksLikeSpecificJobPosting(j.applyUrl))) return 0;
            if (trust === "aggregator") return 1;
            if (trust === "employer") return 2;
            return 3;
        };
        uniqueJobs = uniqueJobs
            .map((j, i) => ({ j, rank: rank(j), i })) // stable sort: original order as tiebreaker
            .sort((a, b) => a.rank - b.rank || a.i - b.i)
            .slice(0, MAX_EVALUATED_JOBS)
            .map((x) => x.j);
    }

    // A genuinely empty search — most commonly a narrow Date Posted filter
    // ("Past 24 hours") for a title/location combo with nothing that fresh —
    // is a real, legitimate outcome, not a failure. Upserting an empty array
    // and then treating "zero rows returned" as an error (below) used to
    // conflate the two; this returns early instead, same "empty state, not
    // an error" principle already applied to SerpApi's own no-results case
    // in lib/jobScraper.ts.
    if (uniqueJobs.length === 0) {
        // Reaching here means the cache contributed nothing relevant either
        // (its rows are merged into rawJobs above and pass the same title
        // filter), so the early upsert has nothing in flight — awaited
        // anyway so this path can never return while a write is still
        // running against the run it is about to mark completed.
        await earlyCacheUpsert;
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

    // Turn this paid search into permanent free coverage: record any
    // employer we do not already track, so lib/proactiveAtsCrawl.ts polls
    // their own careers board from now on. Cost per company becomes a
    // one-off instead of recurring per job.
    //
    // after(), not awaited: nothing on screen depends on it, and making a
    // user wait on a background registry write would be the same mistake
    // that put a description fetch in the render path. Measured on a real
    // search: 40 employers seen, 28 already known, 5 newly registered.
    after(async () => {
        try {
            const harvest = await harvestEmployers(
                createAdminDbClient() as unknown as Parameters<typeof harvestEmployers>[0],
                uniqueJobs.map((job) => ({ company: job.company, applyUrl: job.applyUrl, url: job.url })),
            );
            if (harvest.registeredResolved + harvest.registeredForDiscovery > 0) {
                console.log(
                    `[scraper] discovery harvest: +${harvest.registeredResolved} resolved, ` +
                        `+${harvest.registeredForDiscovery} queued (${harvest.alreadyKnown}/${harvest.seen} already known)`,
                );
            }
        } catch (error) {
            // Never allowed to affect the search it rode in on.
            console.warn("[scraper] discovery harvest failed", error);
        }
    });

    // Settle the cache-first upsert before starting this one. Both write
    // the same rows through merge_job_source, and while that RPC handles a
    // genuine conflict, letting the two overlap would mean the early pass
    // could still be mid-write when this one reads — the authoritative
    // result would then be built from a half-written set. It has almost
    // always resolved long before here anyway; this costs nothing when it
    // has, and is never allowed to reject (its own .catch is attached at
    // creation, so this await cannot throw).
    await earlyCacheUpsert;
    // Same reason the cache upsert is awaited here: these write the same rows
    // through merge_job_source, so the authoritative pass must not start while
    // one is still in flight. Each already swallows its own errors.
    await Promise.all(streamedUpserts);

    const tUpsert = Date.now();
    const savedJobs = await upsertScrapedJobs(userId, uniqueJobs, runId);
    phase.upsert = Date.now() - tUpsert;
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

    // Phase 1 of the 3-phase redesign (2026-09-01, see
    // context/RESUME.md's "Next session, start here"): resolve/verify every
    // job's apply link — free tier for everything, paid-tier rescue
    // (bounded, not score-gated — see verifyApplyLinksBeforeReveal's own
    // comment for why authenticity must never depend on match score) for
    // whatever the free tier can't fix — BEFORE anything is evaluated or
    // revealed. Runs synchronously here so a job that still fails the
    // genuine-link bar afterward is hidden and excluded from evaluation
    // entirely, never spending AI quota on a job that's never going to be
    // shown regardless of how well it scores.
    // Direct product decision (2026-09-05): LinkedIn and Indeed jobs are NOT
    // link-verified during a live search.
    //
    // needsLinkResolution deliberately includes trusted-aggregator links,
    // because "an indirect board link is a floor, not a resting state" — every
    // pass tries to upgrade one to the employer's own posting. That is a good
    // ambition and a terrible thing to make a candidate wait on: LinkedIn and
    // Indeed are the two highest-VOLUME sources, so they dominated the set,
    // and their links already CLEAR the genuine-link bar (classifyApplyHost
    // rates them "aggregator", which meetsGenuineLinkBar passes). The pass was
    // therefore spending most of a search's wall-clock trying to improve links
    // that were already acceptable to show.
    //
    // They still get upgraded — by the hourly repairApplyLinksAsync cron and
    // the per-view lazy resolver, neither of which a candidate waits on. What
    // stays synchronous here is the set where verification decides whether a
    // job is genuine ENOUGH TO SHOW AT ALL, which is the real purpose.
    const SKIP_LIVE_VERIFICATION_SOURCES = new Set(["linkedin", "indeed"]);
    const jobsNeedingVerification = savedJobs.filter(
        (job) => !SKIP_LIVE_VERIFICATION_SOURCES.has((job.source ?? "").trim().toLowerCase()),
    );

    const tVerify = Date.now();
    const { hiddenIds: linkHiddenIds } = await verifyApplyLinksBeforeReveal(insforge, jobsNeedingVerification);
    phase.linkVerification = Date.now() - tVerify;
    console.log(
        `[scraper:timing] TOTAL ${Date.now() - tStart}ms for "${title}"/"${location}" — ` +
        `providers ${phase.providers ?? 0}ms, ats-enrichment ${phase.atsEnrichment ?? 0}ms, ` +
        `upsert ${phase.upsert ?? 0}ms (${savedJobs.length} jobs), link-verify ${phase.linkVerification}ms (${jobsNeedingVerification.length}/${savedJobs.length} jobs)`,
    );
    const linkVerifiedJobs =
        linkHiddenIds.length > 0 ? savedJobs.filter((job) => !linkHiddenIds.includes(job.id)) : savedJobs;

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

    // The searched title/location travel WITH the evaluation (2026-09-04).
    // Without them the evaluator only ever saw the candidate's stored profile
    // and judged every result against their current career — so a developer
    // deliberately searching "Financial Advisor" got a wall of 20% scores
    // reading "does not utilize your software engineering expertise". That is
    // technically true and completely useless: they asked for advisor roles.
    // A deliberate search is a stated intent, and the evaluator has to know
    // it was made, otherwise it is answering a question nobody asked.
    const evaluationFilters = { ...filters, searched_title: title, searched_location: location };
    const { hiddenIds } = await evaluateWithinQuota(insforge, userId, user?.email, linkVerifiedJobs, evaluationFilters, runId);

    // Return the actual saved DB rows (real `id`, not SerpApi's raw id) so
    // the caller can track exactly this search's batch by id, rather than
    // re-matching by title/location text (which drops jobs whose title or
    // location is phrased differently than the search box, e.g. "Software
    // Engineer" vs "Software Developer", or "Markham, ON" vs "Toronto, ON").
    // Excludes anything Phase 1's link gate or the Phase 2 pre-filter just
    // hid — this search's own immediate response should already match what
    // a fresh page load would show, not include a job that's about to be
    // filtered out anyway.
    return linkVerifiedJobs.filter((job) => !hiddenIds.includes(job.id));
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

    const savedJobs = await upsertScrapedJobs(userId, allJobs, null);

    await insforge.database
        .from("target_companies")
        .update({ last_scanned_at: new Date().toISOString() })
        .in("id", companies.map((c) => c.id));

    if (savedJobs.length === 0) return savedJobs;

    const { hiddenIds } = await evaluateWithinQuota(insforge, userId, user?.email, savedJobs, {}, null);
    return hiddenIds.length > 0 ? savedJobs.filter((job) => !hiddenIds.includes(job.id)) : savedJobs;
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

// Cache-first serving's read side (2026-09-04). Returns whatever the
// currently-running search has already written, so the client can paint
// crawl-cache results seconds in instead of waiting out the whole provider
// chain. Deliberately keyed on the run rather than on title/location:
// getUserJobs' ilike match would also return jobs from every PREVIOUS
// search of the same title, which is exactly the "results reset to
// something older" class of bug the find-jobs page has already been fixed
// for twice.
//
// Scoped to the caller's own session, not to the userId argument — every
// value a Server Action receives is client-controlled, and the sibling
// getUserJobs taking a caller-supplied userId at face value is a pattern
// worth not extending to a new function.
export async function getInFlightSearchJobs(userId: string): Promise<Job[]> {
    noStore();

    const user = await getCurrentUser();
    if (!user || user.id !== userId) return [];

    const admin = createAdminDbClient();

    const { data: run } = await admin.database
        .from("agent_runs")
        .select("id,started_at")
        .eq("user_id", userId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle<{ id: string; started_at: string }>();

    if (!run) return [];

    // Only ever serve a genuinely in-flight run. Without this, landing on
    // the page and starting a search would briefly paint the last search's
    // completed rows before this one wrote anything — the same stale-result
    // flash, just sourced differently. Five minutes is well past any real
    // search (the route's own maxDuration is 60s) and well short of "an
    // hour ago".
    if (Date.now() - new Date(run.started_at).getTime() > 5 * 60_000) return [];

    const { data, error } = await admin.database
        .from("jobs")
        .select("*")
        .eq("user_id", userId)
        .eq("run_id", run.id)
        .eq("is_hidden", false);

    if (error) {
        console.warn("[scraper.actions] in-flight search read failed", error);
        return [];
    }
    // Logged because the count is the ONE fact that separates "cache-first is
    // working and the UI isn't showing it" from "cache-first delivered
    // nothing" — indistinguishable from the request log alone, both being a
    // fast 200.
    console.log(
        `[scraper:poll] in-flight run ${run.id.slice(0, 8)} -> ${(data ?? []).length} job(s), ` +
        `${Math.round((Date.now() - new Date(run.started_at).getTime()) / 1000)}s into the search`,
    );
    return (data ?? []) as Job[];
}

// Update this function to accept the title and location filters
export async function getUserJobs(userId: string, title?: string, location?: string) {
    noStore(); // 🛑 Disables Next.js caching for this function

    const insforge = createAdminDbClient();

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