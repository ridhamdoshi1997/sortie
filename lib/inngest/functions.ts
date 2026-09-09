import { inngest } from "./client";
import { resolveModelForUser } from "@/lib/subscription";
import {
    evaluateJobCompatibility,
    evaluateJobCompatibilityLite,
    evaluateLegitimacyOnly,
    type SkillCorrection,
    type EvaluationJob,
    extractJobDetails,
    type JobEvaluationResult,
    type LiteEvaluationResult,
    type EvaluationGrade,
} from "@/lib/evaluator";
import type { ModelProvider, ModelTier } from "@/lib/models";
import { generateResumeUpdateSuggestion } from "@/lib/resumeSuggestions";
import { checkAndConsumeUsage } from "@/lib/usage";
import { createAdminClient, createCacheDbClient } from '@/lib/admin/client';
import { classifyApplyHost } from "@/lib/applyLinkTrust";
import { reresolveApplyLinkForJob, looksLikeSpecificJobPosting } from "@/lib/reresolveApplyLink";
import { ingestJobhiveRegistry } from "@/lib/jobhiveRegistry";
import { fetchPaidSourcesForRun } from "@/lib/actions/scraper.actions";
import { searchJobs } from "@/lib/jobScraper";
import { canonicalCompanyKey } from "@/lib/companyIdentity";
import { crawlKnownAtsCompanies, crawlKnownWorkdayCompanies, crawlKnownIcimsCompanies, pruneStaleDiscoveredPostings, evictCachedPostingsOverBudget, backfillCompanyDomains } from "@/lib/proactiveAtsCrawl";
import { crawlPaused, pausedResult } from "@/lib/crawlPause";
import type { Profile, WorkExperience } from "@/types";

function chunkArray<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

// Extracted from evaluateJobsAsync's own per-chunk loop (2026-08-31, real
// production incident) so the actual Gemini call can carry Inngest's
// `throttle` config — a GLOBAL rate gate enforced across every invocation
// of this function, regardless of which parent run or which user triggered
// it. Before this, evaluateJobsAsync called evaluateJobCompatibility
// directly inside its own step.run() loop with only a 3s step.sleep between
// chunks WITHIN one run — that does nothing to coordinate against every
// OTHER concurrent run for every OTHER user hammering the exact same
// shared API key at the exact same time. Confirmed live: a single test
// account running 3 overlapping searches (281 jobs total) against the
// free-tier GEMINI_API_KEY_FAST — a key this codebase's own comments
// already document as capped at 15 requests/minute — pushed ~73% of
// evaluated jobs into evaluator.ts's fallback path. That's not a per-job
// content problem (replaying the exact same failing job data by hand
// succeeded immediately) — it's uncoordinated concurrent load blowing the
// real rate cap, which pushes complete()'s retry chain onto weaker,
// unvetted backup models that are less reliable against this schema's
// size. At real multi-user launch volume, ANY handful of simultaneous
// searches reproduces this, not just a pathological retry loop from one
// account.
//
// limit/period is a deliberately conservative, UNIFORM safety net across
// every provider+tier combo (keyed separately per combo via throttleKey,
// so gemini/fast doesn't starve gemini/smart or vice versa) — 12/min stays
// safely under gemini/fast's confirmed 15 RPM ceiling. The paid tiers
// (gemini/smart, openai, anthropic) almost certainly tolerate far more than
// 12/min, but there's no live-verified number for any of them yet (per this
// project's own "verify before claiming" rule) — raise their real ceiling
// once that's actually measured, rather than guessing a higher number now.
// Inngest queues excess invocations rather than dropping or erroring them,
// so this only adds latency under real contention, never a new failure
// mode.
type EvaluateJobChunkEventData = {
    jobs: EvaluationJob[];
    filters: Record<string, string>;
    profile: Profile;
    provider: ModelProvider;
    tier: ModelTier;
    corrections: SkillCorrection[];
    throttleKey: string;
    // "lite" (Phase 2 of the 3-phase redesign, 2026-09-01) is what every
    // search/scan/backlog evaluation actually runs now — score + one-line
    // reasoning + matched/missing skills + Legitimacy grade only, at a
    // fraction of the input/output tokens the full 10-dimension pass costs.
    // "full" is the on-demand upgrade for a single job someone actually
    // opens (see evaluateJobFullAsync below) — the original, full rubric.
    mode: "lite" | "full";
    // "full" mode only — the score this job was ALREADY given by its lite
    // pass, so the full pass's own dimension write-ups stay consistent with
    // it instead of silently deriving a different one (see
    // buildPinnedVerdictHint's comment in lib/evaluator.ts for why this
    // matters — a list/detail score mismatch was explicitly flagged as a
    // trust-breaker by the research that validated this redesign).
    pinnedVerdict?: { matchScore: number; overallGrade: EvaluationGrade };
};

export const evaluateJobChunk = inngest.createFunction(
    {
        id: "evaluate-job-chunk",
        name: "Evaluate one job chunk (rate-limited)",
        throttle: { limit: 12, period: "60s", key: "event.data.throttleKey" },
        triggers: [{ event: "jobs/evaluate-chunk" }],
    },
    async ({ event }) => {
        const { jobs, filters, profile, provider, tier, corrections, mode, pinnedVerdict } =
            event.data as EvaluateJobChunkEventData;

        if (mode === "full") {
            const evaluations = await evaluateJobCompatibility(jobs, filters, profile, provider, corrections, tier, pinnedVerdict);
            return { evaluations };
        }

        const evaluations = await evaluateJobCompatibilityLite(jobs, filters, profile, provider, corrections, tier);
        return { evaluations };
    },
);

export const evaluateJobsAsync = inngest.createFunction(
    {
        id: "evaluate-jobs",
        name: "Evaluate Scraped Jobs via Gemini",
        triggers: [{ event: "jobs/evaluate" }]
    },
    async ({ event, step }) => {
        const { jobIds, filters, userId, runId } = event.data as {
            jobIds: string[];
            filters: Record<string, string>;
            userId: string;
            runId?: string | null;
        };

        console.log("🔍 [Inngest] Received jobIds:", jobIds);

        const startedAtMs = Date.now();
        // Background context has no request cookies, so a cookie-based server
        // client here is effectively anonymous — every DB access in this
        // function must go through the admin (service-key) client, which
        // bypasses RLS. The cookie client only ever worked here because RLS
        // was disabled on jobs/profiles, which is now fixed.
        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!
        });

        async function markRunFailed(message: string) {
            if (!runId) return;
            await admin.database
                .from("agent_runs")
                .update({
                    status: "failed",
                    is_successful: false,
                    error_message: message,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", runId);
            await admin.database.from("agent_logs").insert([{
                run_id: runId,
                user_id: userId,
                message,
                level: "error",
            }]);
        }

        // Batched, not one .in("id", jobIds) call — real production
        // failure found live (2026-08-31): PostgREST's .in() filter is
        // serialized into the GET request's query string, and a large
        // enough job count (~100+ UUIDs, 36 chars each) blows past the
        // gateway's URL-length limit — confirmed via two real failed
        // agent_runs, "414 Request-URI Too Large" and a related "502 Bad
        // Gateway", both on searches with 108/210 jobs. This bug always
        // existed; the direct-ATS enrichment work shipped the same day
        // just pushed typical job counts past the threshold that exposed
        // it. 50 IDs/batch keeps each request comfortably short.
        const JOB_FETCH_BATCH_SIZE = 50;
        // Untyped, matching this SDK's own "*" select shape — the
        // single-call version this replaces relied on the same structural
        // flow into EvaluationJob[] downstream (evaluateJobCompatibility),
        // not an explicit row type, so batching preserves that rather than
        // inventing a narrower one.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawJobs: any[] = [];
        for (let i = 0; i < jobIds.length; i += JOB_FETCH_BATCH_SIZE) {
            const batch = jobIds.slice(i, i + JOB_FETCH_BATCH_SIZE);
            const { data, error } = await admin.database.from("jobs").select("*").in("id", batch);
            if (error) {
                console.error("🔍 [Inngest] DB Query Error:", error);
                await markRunFailed(`Failed to fetch jobs from DB: ${error.message}`);
                throw new Error(`Failed to fetch jobs from DB: ${error.message}`);
            }
            if (data) rawJobs.push(...data);
        }

        console.log("🔍 [Inngest] Database returned jobs count:", rawJobs?.length);

        if (!rawJobs || rawJobs.length === 0) {
            return { message: `Successfully evaluated 0 jobs. (Received ${jobIds?.length || 0} IDs, DB returned 0)` };
        }

        // Evaluation now grades against the candidate's real saved profile
        // (skills, salary expectation, work authorization, etc.) instead of
        // a hardcoded placeholder bio — several of the 10 dimensions
        // (compensation, visa, location fit) are meaningless without it.
        const { data: profile, error: profileError } = await admin.database
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle<Profile>();

        if (profileError || !profile) {
            const message = `Failed to load profile for user ${userId}: ${profileError?.message ?? "not found"}`;
            console.error("🔍 [Inngest]", message);
            await markRunFailed(message);
            throw new Error(message);
        }

        // §Q2 correction memory — fetched once per run (typically a small
        // table per user), filtered per-job by role family inside
        // evaluateJobCompatibility rather than re-queried per chunk.
        const { data: corrections } = await admin.database
            .from("skill_corrections")
            .select("role_family,skill,correction_type")
            .eq("user_id", userId);

        const { provider, tier } = await resolveModelForUser(admin, userId, profile.email, profile.preferred_model);
        // Chunk size dropped from 10 to 5 (2026-07-20) — verified live that
        // the richer 2-3 sentence per-dimension notes cause the model to
        // silently under-deliver a 10-job batch (only ~2 of 10 jobs actually
        // evaluated, the rest fell back to neutral placeholders, even at a
        // 24000-token budget — not a truncation issue, the model just stops
        // completing the full batch). Chunk size 5 passed 3/3 live test runs
        // with zero fallbacks; size 8 already failed the same way size 10 did.
        // 10 per chunk, raised from 5 (2026-09-04) because chunk COUNT is
        // what scoring latency actually depends on, not job count. Every
        // chunk is one AI call, and evaluateJobChunk sits behind a global
        // 12-calls-per-60s throttle shared by all users — so 61 jobs at 5/
        // chunk needed 13 calls and spilled into a second throttle window,
        // while at 10/chunk the same search fits in one. Halves calls, halves
        // shared-throttle pressure, and costs nothing in quality: the lite
        // pass returns ~8 short fields per job, so ten of them sit well
        // inside the (also raised) token budget.
        const jobChunks = chunkArray(rawJobs, 10);

        // Chunks are independent (each owns a disjoint slice of jobIds, no
        // shared mutable state) and used to run strictly sequentially with a
        // 3s step.sleep between each — a weak, per-run-only guess at pacing
        // that did nothing to protect the shared API key from every OTHER
        // concurrent run (see evaluateJobChunk's throttle above, the actual
        // fix for that). Once the real pacing moved to a global throttle,
        // that sleep became pure dead time stacked on top of it — a
        // 16-chunk (80-job) search was burning up to 48s in sleeps alone,
        // on top of every chunk's own AI-call latency, entirely serially.
        // Firing every chunk concurrently instead turns a search's total
        // wait from "sum of every chunk's latency" into "the slowest single
        // chunk's latency" — Inngest's throttle still queues them safely
        // against the real rate limit, it just no longer waits for this
        // run's OWN earlier chunks to finish first for no reason.
        const processChunk = async (chunk: (typeof rawJobs)[number][], chunkIndex: number): Promise<void> => {
                // Cast, not relied-on generic inference — matches this
                // file's existing convention of casting event.data at the
                // boundary (see `event.data as {...}` above) rather than
                // fighting the Inngest SDK's generics for a cross-function
                // invoke result. mode: "lite" — Phase 2 of the 3-phase
                // redesign (2026-09-01): this event only ever runs the
                // cheap list-view pass now (score + one-liner + skills +
                // Legitimacy grade). The full 10-dimension write-ups/JD
                // extraction are a separate, on-demand call
                // (evaluateJobFullAsync below), triggered only for a job
                // someone actually opens.
                const { evaluations } = (await step.invoke(`evaluate-chunk-${chunkIndex}`, {
                    function: evaluateJobChunk,
                    data: {
                        jobs: chunk as EvaluationJob[],
                        filters,
                        profile,
                        provider,
                        tier,
                        corrections: (corrections ?? []) as SkillCorrection[],
                        throttleKey: `${provider}:${tier}`,
                        mode: "lite",
                    },
                })) as { evaluations: LiteEvaluationResult[] };

                await step.run(`persist-chunk-${chunkIndex}`, async () => {
                    // Apply-link authenticity (free AND paid-tier rescue)
                    // is now decided ENTIRELY upfront, in
                    // verifyApplyLinksBeforeReveal (lib/reresolveApplyLink.ts),
                    // synchronously in scraper.actions.ts before this job
                    // was ever queued for evaluation — a job still failing
                    // the genuine-link bar after that never reaches this
                    // step at all. Direct correction (2026-09-01, same
                    // session): an earlier version of this file gated the
                    // paid rescue on THIS lite score, which made a real
                    // posting's visibility depend on how well it happened
                    // to fit one candidate's profile — a developer
                    // searching "Financial Advisor" would score everything
                    // low and lose real, official postings that a
                    // finance-background candidate would have kept. That's
                    // backwards: authenticity and fit are orthogonal, and
                    // only authenticity should ever decide visibility. See
                    // verifyApplyLinksBeforeReveal's own comment for the
                    // full account.
                    //
                    // Jobs in a chunk are independent (each only ever
                    // touches its own row), so Promise.all runs every
                    // write in this chunk concurrently rather than one at
                    // a time.
                    await Promise.all(chunk.map(async (job) => {
                        const evalResult = evaluations.find((e) => e.id === job.id);

                        // Two-strike Legitimacy rule (Phase 43/44, direct
                        // user decision — see migrations/20260903120000_
                        // add-legitimacy-two-strike-recheck.sql for the full
                        // state machine). A job's FIRST-ever evaluation can
                        // only ever set legitimacy_fail_count to 0 or 1 —
                        // never hide on it. Real incident that motivated
                        // this: the 2026-09-01 one-time backfill already
                        // found two genuinely real jobs hidden purely
                        // because a single grading pass misread a short
                        // Adzuna preview snippet as a scam signal. Requiring
                        // a SECOND, independent grade (via the periodic
                        // legitimacyRecheckAsync cron below) before a job is
                        // actually hidden means one flaky grade can no
                        // longer permanently hide a real posting. Only ever
                        // SETS is_hidden true via that separate recheck path
                        // — never here, and never explicitly false here
                        // either, since a job could already be hidden for an
                        // unrelated reason (Phase 1's link gate, the
                        // pre-filter, a user action).
                        const failsLegitimacy = evalResult?.legitimacyGrade === "D" || evalResult?.legitimacyGrade === "F";

                        const { error: updateError } = await admin.database
                            .from("jobs")
                            .update({
                                // null (not 0) when evaluation genuinely
                                // failed — a fabricated 0/60 read as a real
                                // score to a candidate (confirmed live
                                // 2026-08-31). null keeps this job in the
                                // same honest "not scored yet" UI state as
                                // a job that hasn't been evaluated at all.
                                match_score: evalResult?.matchScore ?? null,
                                match_reason: evalResult?.reasoning || null,
                                matched_skills: evalResult?.matchedSkills || [],
                                missing_skills: evalResult?.missingSkills || [],
                                recommendation_score: evalResult?.recommendationScore ?? null,
                                overall_grade: evalResult?.overallGrade ?? null,
                                // evaluation (10-dimension write-ups) and
                                // the JD-extraction fields deliberately
                                // stay untouched here — a lite pass has
                                // none of that yet. EvaluationBreakdown.tsx
                                // already no-ops on an empty `evaluation`
                                // array, and RequestFullEvaluationButton
                                // (job-detail page) is what fills these in
                                // on demand.
                                ...(evalResult ? { legitimacy_fail_count: failsLegitimacy ? 1 : 0, legitimacy_checked_at: new Date().toISOString() } : {}),
                                // Written from the LITE pass as of
                                // 2026-09-04 so every card in a results list
                                // carries them, not just jobs someone opened
                                // (the full pass fills these too, and runs
                                // later — it can only ever overwrite these
                                // with equal or better extraction). Empty
                                // strings are normalised to null so the UI's
                                // existing truthiness checks keep working.
                                ...(evalResult?.seniorityLevel ? { seniority_level: evalResult.seniorityLevel } : {}),
                                ...(evalResult?.yearsExperienceRequired ? { years_experience_required: evalResult.yearsExperienceRequired } : {}),
                            })
                            .eq("id", job.id);

                        if (updateError) {
                            throw new Error(`Database Update Failed for Job ${job.id}: ${updateError.message}`);
                        }
                    }));
                });
        };

        try {
            // allSettled, not all — a rejection from one chunk must not
            // cancel the Promise and leave every OTHER already-in-flight
            // chunk's steps as unhandled rejections (Node warns/crashes on
            // those). Every chunk still gets its fair, independent attempt;
            // any failure is surfaced (and the run marked failed) only after
            // everything has actually settled.
            const settled = await Promise.allSettled(
                jobChunks.map((chunk, chunkIndex) => processChunk(chunk, chunkIndex)),
            );
            const firstFailure = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
            if (firstFailure) {
                throw firstFailure.reason;
            }
        } catch (err) {
            console.error("Chunk evaluation failed:", err);
            await markRunFailed((err as Error).message);
            throw err; // Ensure Inngest catches this so the run fails visibly
        }

        // Real bug found live (2026-08-28): this write used to be plain code
        // after the loop, not its own step — dozens of real agent_runs rows
        // were confirmed stuck at status='running' forever even with 100% of
        // their jobs genuinely scored (e.g. 20/20), meaning every job-level
        // write inside the step.run() calls above succeeded but this final
        // write never landed. Wrapping it in its own step.run() makes it a
        // durable, independently-retried checkpoint instead of one-shot code
        // that silently loses if the underlying invocation ends right after
        // the last step.sleep resolves but before this line executes — the
        // same class of risk step.run() exists to close for the per-chunk
        // writes above. Caught separately (not re-thrown) so a failure here
        // never turns an otherwise-fully-scored batch into a false "failed"
        // run — see reconcileStuckAgentRunsAsync below for the backstop that
        // catches anything that still slips through.
        if (runId) {
            try {
                await step.run("mark-run-completed", async () => {
                    const { error } = await admin.database
                        .from("agent_runs")
                        .update({
                            status: "completed",
                            is_successful: true,
                            total_time_ms: Date.now() - startedAtMs,
                            updated_at: new Date().toISOString(),
                        })
                        .eq("id", runId);
                    if (error) throw new Error(`Failed to mark run ${runId} completed: ${error.message}`);
                });
            } catch (err) {
                console.error("[inngest] evaluateJobsAsync: failed to mark run completed", err);
            }
        }

        return { message: `Successfully evaluated ${rawJobs.length} jobs.` };
    }
);

// Phase 3 of the 3-phase redesign (2026-09-01, see context/RESUME.md's
// "Next session, start here") — the on-demand full-rubric upgrade for a
// single job someone actually opens. Triggered by actions/jobs.ts's
// requestFullJobEvaluation, the same manual-button UX
// RequestScoringButton.tsx already established for a never-scored job
// (RequestFullEvaluationButton.tsx reuses that exact pattern for a
// lite-scored-but-not-yet-full one).
//
// Deliberately NEVER writes match_score/recommendation_score/overall_grade/
// matched_skills/missing_skills/match_reason — those are locked in at lite
// time and stay immutable here ("score drift" — the research that
// validated this redesign flagged an 85%-in-the-list/65%-on-open mismatch
// as an instant trust-breaker). This call only ADDS the 10-dimension
// write-ups and JD-extraction fields the lite pass never produced; the
// pinnedVerdict passed to evaluateJobChunk keeps the model's own dimension
// notes consistent with the score it isn't allowed to change.
export const evaluateJobFullAsync = inngest.createFunction(
    { id: "evaluate-job-full", name: "Full-rubric evaluation (on-demand)", triggers: [{ event: "jobs/evaluate-full" }] },
    async ({ event, step }) => {
        const { jobId, userId } = event.data as { jobId: string; userId: string };

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const { data: job } = await admin.database
            .from("jobs")
            .select("*")
            .eq("id", jobId)
            .maybeSingle();

        if (!job) return { message: "Job not found — nothing to evaluate." };
        // requestFullJobEvaluation already guards both of these before
        // sending this event, but this function can be invoked directly
        // (Inngest dashboard replay, a future caller), so it re-checks
        // rather than trusting the sender.
        if (job.match_score === null || job.match_score === undefined) {
            return { message: "Job has no lite score yet — full evaluation needs one to pin against." };
        }
        if (Array.isArray(job.evaluation) && job.evaluation.length > 0) {
            return { message: "Job already has a full evaluation — nothing to do." };
        }

        const { data: profile } = await admin.database
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle<Profile>();
        if (!profile) return { message: `Profile not found for user ${userId}.` };

        const { data: corrections } = await admin.database
            .from("skill_corrections")
            .select("role_family,skill,correction_type")
            .eq("user_id", userId);

        const { provider, tier } = await resolveModelForUser(admin, userId, profile.email, profile.preferred_model);

        const { evaluations } = (await step.invoke("evaluate-full", {
            function: evaluateJobChunk,
            data: {
                jobs: [job] as EvaluationJob[],
                filters: {},
                profile,
                provider,
                tier,
                corrections: (corrections ?? []) as SkillCorrection[],
                throttleKey: `${provider}:${tier}`,
                mode: "full",
                pinnedVerdict: { matchScore: job.match_score, overallGrade: (job.overall_grade ?? "C") as EvaluationGrade },
            },
        })) as { evaluations: JobEvaluationResult[] };

        const evalResult = evaluations[0];
        if (!evalResult) return { message: "Full evaluation failed — will need a manual retry." };

        await step.run("persist-full-evaluation", async () => {
            const { error } = await admin.database
                .from("jobs")
                .update({
                    evaluation: evalResult.dimensions ?? null,
                    responsibilities: evalResult.responsibilities || [],
                    requirements: evalResult.requirements || [],
                    nice_to_have: evalResult.niceToHave || [],
                    benefits: evalResult.benefits || [],
                    about_role: evalResult.aboutRole || null,
                    hiring_process: evalResult.hiringProcess || [],
                    seniority_level: evalResult.seniorityLevel || null,
                    years_experience_required: evalResult.yearsExperienceRequired || null,
                    title_scope_mismatch: evalResult.titleScopeMismatch ?? null,
                    // Fallback only, same rule as the lite/full write in
                    // evaluateJobsAsync — never overwrite a real structured
                    // value already on the row.
                    ...(job.salary ? {} : { salary: evalResult.salary || null }),
                    ...(job.company_logo_url || !evalResult.companyDomain
                        ? {}
                        : { company_logo_url: `https://unavatar.io/${evalResult.companyDomain}?fallback=false` }),
                })
                .eq("id", jobId);
            if (error) throw new Error(`Full evaluation persist failed for job ${jobId}: ${error.message}`);
        });

        // Share what the model just worked out about this EMPLOYER, not just
        // this job (2026-09-09, direct user idea: "when we make an AI call why
        // can't we ask all the details in the same call... and add those
        // details if we are missing them").
        //
        // The model already returns companyDomain, and the prompt is written to
        // refuse a guess it is not confident in. Until now that answer was
        // written onto ONE job row, so the same employer's other postings --
        // often hundreds of them -- stayed logo-less and the next opened job
        // paid to work it out again.
        //
        // Writing it to company_domains makes it permanent and shared. This is
        // also the cheapest coverage available for the tail Clearbit cannot
        // resolve: a model recognises "Ontario Teachers' Pension Plan" ->
        // otpp.com where a name-matching autocomplete does not, and it costs
        // nothing extra because the call was already made and paid for.
        //
        // Never overwrites an existing domain -- a resolver hit is evidence
        // from the live web, and this is recall.
        if (evalResult.companyDomain && job.company) {
            await step.run("share-company-domain", async () => {
                const key = canonicalCompanyKey(job.company as string);
                const { error } = await createCacheDbClient()
                    .database.from("company_domains")
                    .upsert(
                        {
                            company_key: key,
                            company_name: job.company,
                            domain: evalResult.companyDomain,
                            resolved_at: new Date().toISOString(),
                        },
                        { onConflict: "company_key", ignoreDuplicates: false },
                    );
                // Cosmetic: a failure here costs a logo, never the evaluation.
                if (error) console.warn(`[evaluate-job-full] company domain share failed: ${error.message}`);
                else console.log(`[evaluate-job-full] shared ${job.company} -> ${evalResult.companyDomain}`);
            });
        }

        return { message: `Full evaluation complete for job ${jobId}.` };
    },
);

// §Q4c Always-warm résumé — fired from actions/accomplishments.ts's
// addAccomplishment right after a real insert, same trigger pattern as
// jobs/evaluate above. One suggested bullet per accomplishment, queued as
// 'pending' for review through the existing was/now diff-card UI — never
// written directly into the résumé.
function currentOrMostRecentRole(workExperience: WorkExperience[] | null | undefined): { title: string; company: string } {
    const roles = workExperience ?? [];
    const current = roles.find((r) => r.is_current);
    if (current) return { title: current.title, company: current.company };

    const mostRecent = [...roles].sort(
        (a, b) => new Date(b.end_date ?? b.start_date).getTime() - new Date(a.end_date ?? a.start_date).getTime(),
    )[0];
    if (mostRecent) return { title: mostRecent.title, company: mostRecent.company };

    return { title: "Professional", company: "your background" };
}

export const generateResumeSuggestionAsync = inngest.createFunction(
    { id: "generate-resume-suggestion", name: "Generate Always-Warm Résumé Suggestion", triggers: [{ event: "accomplishments/logged" }] },
    async ({ event, step }) => {
        const { accomplishmentId, userId } = event.data as { accomplishmentId: string; userId: string };

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const { data: accomplishment } = await step.run("fetch-accomplishment", async () => {
            return admin.database
                .from("accomplishments")
                .select("id,title,description")
                .eq("id", accomplishmentId)
                .eq("user_id", userId)
                .maybeSingle<{ id: string; title: string; description: string | null }>();
        });

        if (!accomplishment) {
            return { message: `Accomplishment ${accomplishmentId} not found, skipping.` };
        }

        const { data: profile } = await step.run("fetch-profile", async () => {
            return admin.database
                .from("profiles")
                .select("work_experience,preferred_model,email")
                .eq("id", userId)
                .maybeSingle<Pick<Profile, "work_experience" | "preferred_model" | "email">>();
        });

        // Same minimum-cost-launch policy as every other AI action (lib/usage.ts)
        // — reuses bullet_rewrite's cap rather than a dedicated action, since
        // this is the exact same cost/shape (one fast-tier bullet rewrite),
        // just background-triggered instead of user-clicked. A capped-out day
        // means this accomplishment simply gets no suggestion, not an error
        // the user ever sees — consistent with this being a nice-to-have, not
        // a required side effect of logging real career history.
        const usage = await step.run("check-usage", () =>
            checkAndConsumeUsage(admin, userId, profile?.email, "bullet_rewrite"),
        );
        if (!usage.allowed) {
            return { message: `Daily bullet-rewrite cap reached for user ${userId}, skipping suggestion.` };
        }

        const role = currentOrMostRecentRole(profile?.work_experience);
        const { provider, tier } = await resolveModelForUser(admin, userId, profile?.email, profile?.preferred_model);

        const bullet = await step.run("generate-suggestion", () =>
            generateResumeUpdateSuggestion(accomplishment.title, accomplishment.description, role, provider, tier),
        );

        if (!bullet) {
            return { message: `Suggestion generation failed for accomplishment ${accomplishmentId}, nothing queued.` };
        }

        const { error } = await admin.database.from("resume_update_suggestions").insert([
            { user_id: userId, accomplishment_id: accomplishmentId, suggested_bullet: bullet },
        ]);

        if (error) {
            throw new Error(`Failed to queue résumé suggestion for accomplishment ${accomplishmentId}: ${error.message}`);
        }

        return { message: `Queued a résumé suggestion for accomplishment ${accomplishmentId}.` };
    },
);

// Marketing broadcasts (admin console expansion item 5) — triggered from
// actions/adminMarketing.ts's sendBroadcast() after it flips the row to
// "sending". Chunked via the existing chunkArray() helper (same shape as
// evaluateJobsAsync's job-batch chunking above), each chunk its own
// step.run() so a transient failure mid-send retries just that chunk
// instead of resending everyone. Sends only to profiles with a real email
// and marketing_opt_out = false — CAN-SPAM compliance (physical address +
// unsubscribe link) is enforced inside lib/email/resend.ts's
// sendMarketingEmail(), not duplicated here.
export const sendMarketingBroadcastAsync = inngest.createFunction(
    { id: "send-marketing-broadcast", name: "Send Marketing Broadcast", triggers: [{ event: "marketing/broadcast.send" }] },
    async ({ event, step }) => {
        const { broadcastId } = event.data as { broadcastId: string };

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const { data: broadcast } = await step.run("fetch-broadcast", async () => {
            return admin.database
                .from("marketing_broadcasts")
                .select("id,subject,body_markdown,status,segment")
                .eq("id", broadcastId)
                .maybeSingle<{ id: string; subject: string; body_markdown: string; status: string; segment: "all" | "active_7d" | "inactive_30d" }>();
        });

        if (!broadcast) {
            return { message: `Broadcast ${broadcastId} not found, skipping.` };
        }

        const { getSegmentUserIds } = await import("@/lib/admin/marketing");
        const segmentUserIds = await step.run("resolve-segment", () => getSegmentUserIds(broadcast.segment));

        const { data: recipients } = await step.run("fetch-recipients", async () => {
            return admin.database
                .from("profiles")
                .select("email,unsubscribe_token")
                .eq("marketing_opt_out", false)
                .not("email", "is", null)
                .in("id", segmentUserIds.length > 0 ? segmentUserIds : ["00000000-0000-0000-0000-000000000000"]);
        });

        const recipientList = (recipients ?? []) as { email: string; unsubscribe_token: string }[];
        const chunks = chunkArray(recipientList, 25);

        const { sendMarketingEmail } = await import("@/lib/email/resend");
        const physicalAddress = process.env.MARKETING_PHYSICAL_ADDRESS ?? "";

        let sentCount = 0;
        for (let i = 0; i < chunks.length; i++) {
            const results = await step.run(`send-chunk-${i}`, async () => {
                const outcomes = await Promise.all(
                    chunks[i].map((r) =>
                        sendMarketingEmail({
                            to: r.email,
                            subject: broadcast.subject,
                            body: broadcast.body_markdown,
                            unsubscribeToken: r.unsubscribe_token,
                            physicalAddress,
                            broadcastId,
                        }),
                    ),
                );
                return outcomes.filter((o) => o.success).length;
            });
            sentCount += results;
        }

        await admin.database
            .from("marketing_broadcasts")
            .update({
                status: "sent",
                recipient_count: recipientList.length,
                sent_count: sentCount,
                sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq("id", broadcastId);

        return { message: `Broadcast ${broadcastId}: ${sentCount}/${recipientList.length} sent.` };
    },
);

// Push notifications — the second Marketing broadcast channel, paired
// with email per the original plan. A stale subscription (browser push
// service returns 404/410 — the user uninstalled, cleared storage, etc.)
// is deleted right here rather than left to error again on every future
// send.
export const sendPushBroadcastAsync = inngest.createFunction(
    { id: "send-push-broadcast", name: "Send Push Broadcast", triggers: [{ event: "push/broadcast.send" }] },
    async ({ event, step }) => {
        const { title, body, url } = event.data as { title: string; body: string; url?: string };

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const { data: subscriptions } = await step.run("fetch-subscriptions", async () => {
            return admin.database.from("push_subscriptions").select("id,endpoint,p256dh,auth");
        });

        const subs = (subscriptions ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];
        const chunks = chunkArray(subs, 25);
        const { sendPushNotification } = await import("@/lib/push");

        let sentCount = 0;
        for (let i = 0; i < chunks.length; i++) {
            const outcome = await step.run(`send-chunk-${i}`, async () => {
                let sent = 0;
                const staleIds: string[] = [];
                await Promise.all(
                    chunks[i].map(async (s) => {
                        const result = await sendPushNotification(s, { title, body, url });
                        if (result.success) {
                            sent++;
                        } else if (result.expired) {
                            staleIds.push(s.id);
                        }
                    }),
                );
                if (staleIds.length > 0) {
                    await admin.database.from("push_subscriptions").delete().in("id", staleIds);
                }
                return { sent, staleCount: staleIds.length };
            });
            sentCount += outcome.sent;
        }

        return { message: `Push broadcast: ${sentCount}/${subs.length} sent.` };
    },
);

// Programmatic SEO/GEO content engine (Phase 18 item 1, context/RESUME.md).
// Two triggers on the same function: a weekly cron for the automatic
// pipeline, and a manual event fired from a "Generate now" admin button
// (actions/adminContent.ts) for on-demand extra content or live testing —
// both run the exact same lib/admin/geoContent.ts logic, no duplicated
// pick-topic/draft/insert flow. Never fails loudly when there's nothing new
// to cover — that's a normal steady state, not an error.
// "Success Story" content repurposing pipeline (Phase 18 item 2,
// context/RESUME.md). Fired from actions/jobs.ts's setApplicationStatus
// right after a real 'offered' transition — see lib/admin/socialDrafts.ts
// for the anonymization rules the draft itself is written under.
export const generateSuccessStoryAsync = inngest.createFunction(
    { id: "generate-success-story", name: "Generate Success Story Draft", triggers: [{ event: "success-story/consider" }] },
    async ({ event, step }) => {
        const { jobId, userId } = event.data as { jobId: string; userId: string };
        const { generateAndQueueSuccessStory } = await import("@/lib/admin/socialDrafts");
        const result = await step.run("generate-and-queue", () => generateAndQueueSuccessStory(jobId, userId));

        return result
            ? { message: `Queued a success story draft ${result.draftId} for job ${jobId}.` }
            : { message: `No draft queued for job ${jobId} (job not found or already has one).` };
    },
);

// Follow-up timing nudges (build-plan.md §C) — the proactive half of the
// feature; the inline banner (FollowUpNudge.tsx) is the reactive half. No
// new paid-API cost (a plain DB query + the already-shipped push infra),
// unlike Job Alerts' blocked background-search shape — a real, deliberate
// distinction, not an oversight. Never re-nudges the same job twice
// (jobs.follow_up_nudged_at is set once and never cleared).
export const sendFollowUpNudgesAsync = inngest.createFunction(
    { id: "send-follow-up-nudges", name: "Send Follow-up Timing Nudges", triggers: [{ cron: "0 14 * * 1" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Follow-up nudges");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

        const { data: eligibleJobs } = await step.run("find-eligible-jobs", async () => {
            return admin.database
                .from("jobs")
                .select("id,user_id,title,company")
                .eq("application_status", "applied")
                .is("follow_up_nudged_at", null)
                .lte("application_status_updated_at", sevenDaysAgo);
        });

        const jobs = (eligibleJobs ?? []) as { id: string; user_id: string; title: string | null; company: string | null }[];
        if (jobs.length === 0) {
            return { message: "No jobs eligible for a follow-up nudge right now." };
        }

        const jobsByUser = new Map<string, typeof jobs>();
        for (const job of jobs) {
            jobsByUser.set(job.user_id, [...(jobsByUser.get(job.user_id) ?? []), job]);
        }

        const { sendPushNotification } = await import("@/lib/push");
        let nudgedUsers = 0;

        for (const [userId, userJobs] of jobsByUser.entries()) {
            await step.run(`nudge-user-${userId}`, async () => {
                const { data: subs } = await admin.database
                    .from("push_subscriptions")
                    .select("id,endpoint,p256dh,auth")
                    .eq("user_id", userId);

                const subscriptions = (subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string }[];

                if (subscriptions.length > 0) {
                    const count = userJobs.length;
                    const title = "Time to follow up?";
                    const body =
                        count === 1
                            ? `Your application to ${userJobs[0].company ?? "a company"} has had no update in a week.`
                            : `${count} applications have had no update in a week.`;

                    const staleIds: string[] = [];
                    for (const sub of subscriptions) {
                        const result = await sendPushNotification(sub, { title, body, url: "/missions" });
                        if (!result.success && result.expired) staleIds.push(sub.id);
                    }
                    if (staleIds.length > 0) {
                        await admin.database.from("push_subscriptions").delete().in("id", staleIds);
                    }
                }

                // Marked nudged regardless of whether a push subscription
                // existed — the inline banner already covers users without
                // push enabled, and this stops the same job from being
                // re-evaluated by this cron every week forever.
                await admin.database
                    .from("jobs")
                    .update({ follow_up_nudged_at: new Date().toISOString() })
                    .in("id", userJobs.map((j) => j.id));
            });
            nudgedUsers += 1;
        }

        return { message: `Evaluated ${jobs.length} stale applications across ${nudgedUsers} users.` };
    },
);

// Proactive weekly AI briefing (build-plan.md §H, "AI heavy dashboard" part
// 2, direct user request). Same "find eligible users, loop, one step per
// user" shape as sendFollowUpNudgesAsync above. Deliberately does NOT run
// for every user — only those with real activity this week or a real
// upcoming deadline, both queried directly (not a blanket "every user gets
// a call" cron, which would be real recurring cost on completely dormant
// accounts for zero value). Not gated through checkAndConsumeUsage — that's
// for user-initiated actions with a daily cap; this is a system-scheduled
// job already inherently bounded to once/week per eligible user by its own
// cadence and eligibility filter.
export const generateWeeklyBriefingsAsync = inngest.createFunction(
    { id: "generate-weekly-briefings", name: "Generate Weekly AI Dashboard Briefings", triggers: [{ cron: "0 9 * * 1" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Weekly briefings");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        const eligibleUserIds = await step.run("find-eligible-users", async () => {
            const ids = new Set<string>();

            const { data: newJobs } = await admin.database
                .from("jobs")
                .select("user_id")
                .gte("found_at", sevenDaysAgo)
                .returns<{ user_id: string }[]>();
            for (const row of newJobs ?? []) ids.add(row.user_id);

            const { data: appEvents } = await admin.database
                .from("application_events")
                .select("user_id")
                .gte("event_date", sevenDaysAgo)
                .returns<{ user_id: string }[]>();
            for (const row of appEvents ?? []) ids.add(row.user_id);

            const { data: interviewEvents } = await admin.database
                .from("interview_events")
                .select("user_id")
                .gte("event_date", sevenDaysAgo)
                .returns<{ user_id: string }[]>();
            for (const row of interviewEvents ?? []) ids.add(row.user_id);

            const { data: deadlineJobs } = await admin.database
                .from("jobs")
                .select("user_id")
                .gte("next_deadline_at", now)
                .lte("next_deadline_at", sevenDaysFromNow)
                .returns<{ user_id: string }[]>();
            for (const row of deadlineJobs ?? []) ids.add(row.user_id);

            return Array.from(ids);
        });

        if (eligibleUserIds.length === 0) {
            return { message: "No users with real activity or an upcoming deadline this week — nothing generated." };
        }

        const { generateWeeklyBriefing } = await import("@/lib/weeklyBriefing");
        let generatedCount = 0;

        for (const userId of eligibleUserIds) {
            await step.run(`generate-for-${userId}`, async () => {
                const [{ data: newJobsForUser }, { data: appEventsForUser }, { data: interviewEventsForUser }, { data: deadlineJobsForUser }, { data: profile }] =
                    await Promise.all([
                        admin.database.from("jobs").select("id").eq("user_id", userId).gte("found_at", sevenDaysAgo),
                        admin.database.from("application_events").select("event_type").eq("user_id", userId).gte("event_date", sevenDaysAgo),
                        admin.database.from("interview_events").select("id").eq("user_id", userId).gte("event_date", sevenDaysAgo),
                        admin.database
                            .from("jobs")
                            .select("title,company,next_deadline_at,next_deadline_label")
                            .eq("user_id", userId)
                            .gte("next_deadline_at", now)
                            .lte("next_deadline_at", sevenDaysFromNow)
                            .returns<{ title: string | null; company: string | null; next_deadline_at: string; next_deadline_label: string | null }[]>(),
                        admin.database
                            .from("profiles")
                            .select("preferred_model,email,marketing_opt_out,unsubscribe_token")
                            .eq("id", userId)
                            .maybeSingle<
                                Pick<Profile, "preferred_model" | "email"> & {
                                    marketing_opt_out: boolean;
                                    unsubscribe_token: string;
                                }
                            >(),
                    ]);

                const applicationsThisWeek = (appEventsForUser ?? []).filter((e: { event_type: string }) => e.event_type === "applied").length;
                const offersThisWeek = (appEventsForUser ?? []).filter((e: { event_type: string }) => e.event_type === "offered").length;

                const snapshot = {
                    jobsFoundThisWeek: (newJobsForUser ?? []).length,
                    applicationsThisWeek,
                    interviewsThisWeek: (interviewEventsForUser ?? []).length,
                    offersThisWeek,
                    upcomingDeadlines: (deadlineJobsForUser ?? []).map((j) => ({
                        label: j.next_deadline_label || `${j.title ?? "A job"} at ${j.company ?? "a company"}`,
                        daysAway: Math.max(0, Math.ceil((new Date(j.next_deadline_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000))),
                    })),
                };

                const { provider, tier } = await resolveModelForUser(admin, userId, profile?.email ?? undefined, profile?.preferred_model);
                const result = await generateWeeklyBriefing(snapshot, provider, tier);

                await admin.database
                    .from("profiles")
                    .update({ weekly_briefing: result.summary, weekly_briefing_generated_at: new Date().toISOString() })
                    .eq("id", userId);

                // Proactive match digest email (build-plan.md §G) — same
                // real summary already computed above for the in-app card,
                // reused as the email body rather than a second AI call.
                // Same CAN-SPAM gate as sendMarketingBroadcastAsync above
                // (marketing_opt_out + physical address + real unsubscribe
                // link, all enforced inside sendMarketingEmail itself).
                const physicalAddress = process.env.MARKETING_PHYSICAL_ADDRESS ?? "";
                if (profile?.email && profile.marketing_opt_out === false && profile.unsubscribe_token && physicalAddress) {
                    const { sendMarketingEmail } = await import("@/lib/email/resend");
                    await sendMarketingEmail({
                        to: profile.email,
                        subject: "Your weekly Sortie digest",
                        body: result.summary,
                        unsubscribeToken: profile.unsubscribe_token,
                        physicalAddress,
                        broadcastId: `weekly-digest-${userId}`,
                    });
                }
            });
            generatedCount += 1;
        }

        return { message: `Generated weekly briefings for ${generatedCount} user${generatedCount === 1 ? "" : "s"}.` };
    },
);

export const generateGeoContentAsync = inngest.createFunction(
    {
        id: "generate-geo-content",
        name: "Generate Programmatic SEO/GEO Page",
        triggers: [{ event: "geo/generate-content" }, { cron: "0 8 * * 1" }],
    },
    async ({ step }) => {
        const { generateAndQueueGeoPage } = await import("@/lib/admin/geoContent");
        const result = await step.run("generate-and-queue", () => generateAndQueueGeoPage());

        return result
            ? { message: `Queued a new GEO draft page: ${result.slug}` }
            : { message: "No fresh, well-sampled topic to cover right now — nothing queued." };
    },
);

// Vanguard (build-plan.md §J, direct user request) is a one-time $149
// lifetime purchase, not a Stripe subscription — so unlike Command, there's
// no recurring invoice.paid webhook to advance current_period_start/
// current_period_end on api_usage_metrics' own monthly-rolling schedule
// (lib/subscription.ts's checkUsageLimit keys entirely off that period).
// Runs daily rather than on a fixed calendar day so each Vanguard holder's
// own purchase-anniversary period rolls forward on ITS OWN schedule, same
// "not a shared calendar-month boundary" principle the original
// api_usage_metrics migration established for every other plan — a user
// who buys mid-month keeps resetting mid-month forever, not on the 1st.
// Bulk query bounded to at most `max_seats` (250) rows ever, so a plain
// per-row loop (same shape as sendFollowUpNudgesAsync/
// generateWeeklyBriefingsAsync above) is plenty, no batching needed.
// Inbox/Pipeline split's own TTL auto-archive (same direct user request as
// the Vanguard/lifetime-plan work above, `agy`-researched — see
// context/RESUME.md's "draft logic" entry). A job sitting in "inbox"
// (pre-pipeline, untriaged — see the add-inbox-shortlisted-stages
// migration) that's still there 14 days after it was found gets archived
// (is_hidden = true, same lever bulkHideJobs/the Missions "Archive
// selected" bulk action already use) rather than left to pile up forever —
// real trackers researched (Huntr/Teal/JobRight) all auto-archive an
// untouched inbox item instead of letting it become permanent dead weight.
// A plain bulk UPDATE across all users, not a per-row loop — this is a
// zero-AI-cost DB-only operation the same shape as the seat-claim work
// above, just admin-wide instead of user-scoped.
const INBOX_ARCHIVE_AFTER_DAYS = 14;

export const archiveStaleInboxJobsAsync = inngest.createFunction(
    { id: "archive-stale-inbox-jobs", name: "Archive Stale Inbox Jobs", triggers: [{ cron: "0 4 * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Stale inbox archive");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const archivedCount = await step.run("archive-untouched-inbox-jobs", async () => {
            const cutoff = new Date(Date.now() - INBOX_ARCHIVE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

            const { count } = await admin.database
                .from("jobs")
                .select("id", { count: "exact", head: true })
                .eq("application_status", "inbox")
                .eq("is_hidden", false)
                .lte("found_at", cutoff);

            if (!count) return 0;

            const { error } = await admin.database
                .from("jobs")
                .update({ is_hidden: true })
                .eq("application_status", "inbox")
                .eq("is_hidden", false)
                .lte("found_at", cutoff);

            if (error) {
                console.error("[inngest] archiveStaleInboxJobsAsync", error);
                return 0;
            }

            return count;
        });

        return { message: `Archived ${archivedCount} untouched Inbox job${archivedCount === 1 ? "" : "s"}.` };
    },
);

// Self-healing backstop for the "agent_runs.status never flips to
// completed" bug found live (2026-08-28) — confirmed dozens of real runs
// stuck at status='running' indefinitely (some for weeks) despite 100% of
// their jobs having a real match_score, because evaluateJobsAsync's final
// status write used to be plain code, not a durable step (now fixed
// above). This cron catches anything that still slips through that fix —
// a genuinely dead Inngest function, a retry-exhausted write, a future
// regression of the same class — by recomputing "is this run actually
// done" from the real source of truth (the jobs table itself) rather than
// trusting the write ever happened. Runs every 15 minutes: cheap (no AI
// calls, no jobs beyond what a normal search already creates), and this is
// the kind of staleness a user notices quickly (a stuck "Scoring…" pill),
// so a daily cadence like the crons above would leave it wrong for too long.
export const reconcileStuckAgentRunsAsync = inngest.createFunction(
    { id: "reconcile-stuck-agent-runs", name: "Reconcile Stuck Agent Runs", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Stuck-run reconcile");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const fixedCount = await step.run("fix-fully-scored-stuck-runs", async () => {
            const { data: runningRuns, error: runsError } = await admin.database
                .from("agent_runs")
                .select("id")
                .eq("status", "running")
                .returns<{ id: string }[]>();

            if (runsError || !runningRuns || runningRuns.length === 0) return 0;

            const runningIds = runningRuns.map((r) => r.id);
            const { data: runJobs, error: jobsError } = await admin.database
                .from("jobs")
                .select("run_id, match_score")
                .in("run_id", runningIds)
                .returns<{ run_id: string; match_score: number | null }[]>();

            if (jobsError || !runJobs) return 0;

            // A run only qualifies once it has at least one job AND none of
            // them are still unscored — a run with zero jobs tied to it is a
            // different, unrelated failure mode (never got jobs at all),
            // deliberately left alone here rather than guessed at.
            const jobCountByRun = new Map<string, number>();
            const unscoredByRun = new Set<string>();
            for (const job of runJobs) {
                jobCountByRun.set(job.run_id, (jobCountByRun.get(job.run_id) ?? 0) + 1);
                if (job.match_score === null) unscoredByRun.add(job.run_id);
            }

            const fullyScoredRunIds = runningIds.filter(
                (id) => (jobCountByRun.get(id) ?? 0) > 0 && !unscoredByRun.has(id),
            );

            if (fullyScoredRunIds.length === 0) return 0;

            const { error: updateError } = await admin.database
                .from("agent_runs")
                .update({ status: "completed", is_successful: true, updated_at: new Date().toISOString() })
                .in("id", fullyScoredRunIds);

            if (updateError) {
                console.error("[inngest] reconcileStuckAgentRunsAsync", updateError);
                return 0;
            }

            return fullyScoredRunIds.length;
        });

        return { message: `Reconciled ${fixedCount} stuck agent run${fixedCount === 1 ? "" : "s"}.` };
    },
);

// Self-healing apply-link repair (2026-08-30, direct user request while
// planning for launch: "this will not happen with real users in the
// future"). Wiping and re-scraping the jobs table was an acceptable
// last-resort cleanup while this was test data; with real users it never
// is. This continuously repairs bad links IN PLACE instead, so the same
// class of problem never needs a destructive fix again.
//
// Deliberately FREE TIERS ONLY (freeOnly: true) — this project's SerpApi
// access is 3 free-tier keys shared with live user search (one was
// already observed exhausted during a single measurement search), so a
// cron that could reach the paid tiers would be able to starve real users
// of search. It also processes a bounded batch per run rather than the
// whole table, so a large backlog drains gradually instead of hammering
// employer career sites.
const LINK_REPAIR_BATCH_SIZE = 40;

export const repairApplyLinksAsync = inngest.createFunction(
    { id: "repair-apply-links", name: "Repair Apply Links", triggers: [{ cron: "20 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Apply-link repair");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const repaired = await step.run("repair-batch", async () => {
            // Oldest-attempted first (nulls first) so every job gets a turn
            // and nothing is starved by newer arrivals.
            const { data: candidates, error } = await admin.database
                .from("jobs")
                .select("id, title, company, location, external_apply_url, raw_apply_options, apply_link_resolved_at")
                .not("external_apply_url", "is", null)
                .order("apply_link_resolved_at", { ascending: true, nullsFirst: true })
                .limit(LINK_REPAIR_BATCH_SIZE * 4)
                .returns<{
                    id: string;
                    title: string | null;
                    company: string | null;
                    location: string | null;
                    external_apply_url: string | null;
                    raw_apply_options: unknown;
                }[]>();

            if (error || !candidates?.length) return 0;

            const needsWork = candidates
                .filter((job) => {
                    if (!job.external_apply_url) return false;
                    const trust = classifyApplyHost(job.external_apply_url, job.company);
                    if (trust === "ats") return false;
                    if (trust === "employer") return !looksLikeSpecificJobPosting(job.external_apply_url);
                    return true;
                })
                .slice(0, LINK_REPAIR_BATCH_SIZE);

            let count = 0;
            for (const job of needsWork) {
                const before = job.external_apply_url;
                try {
                    await reresolveApplyLinkForJob(admin, job, { freeOnly: true });
                } catch (err) {
                    console.error("[inngest] repairApplyLinksAsync", job.id, err);
                    continue;
                }
                const { data: after } = await admin.database
                    .from("jobs")
                    .select("external_apply_url")
                    .eq("id", job.id)
                    .single();
                if (after && after.external_apply_url !== before) count++;
            }
            return count;
        });

        return { message: `Repaired ${repaired} apply link${repaired === 1 ? "" : "s"}.` };
    },
);

// Proactive ATS crawl (2026-09-01) — see
// migrations/20260901120000_add-proactive-ats-crawl.sql and
// lib/proactiveAtsCrawl.ts for the full rationale (short version: closes
// the reactive-only gap RESUME.md's redesign flagged as the actual lever
// for the volume gap against a funded competitor). This only reads PUBLIC,
// unlimited ATS endpoints (no SerpApi/paid quota at risk the way that
// cron's freeOnly guard exists to protect), so there's no cost pressure to
// space this out.
//
// Tightened from every 30 minutes to every 15 (Phase 40/43, direct user
// decision) alongside raising CRAWL_BATCH_SIZE from 15 to 150 — the
// original "ats_registry grows too slowly for a tighter interval to
// matter" reasoning was true for an ~80-company organically-discovered
// registry, but no longer holds after seeding ~9,646 companies from the
// free LastRound AI ATS directory. At 150/15min, a full pass over the
// current registry completes in under a day instead of the ~13 days the
// old rate would have needed.
export const proactiveAtsCrawlAsync = inngest.createFunction(
    { id: "proactive-ats-crawl", name: "Proactive ATS Crawl", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Proactive ATS crawl");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const result = await step.run("crawl-batch", () => crawlKnownAtsCompanies(admin, createCacheDbClient()));

        // Resolve employer domains for company logos on the same schedule.
        // Its own step so a failure here cannot fail the crawl, and so the
        // 200-company batch is retried independently. At 200 per run, four
        // runs an hour, the 68,404-company registry backfills in a few days --
        // and every company is paid for once, ever.
        const domains = await step.run("backfill-company-domains", () => backfillCompanyDomains(admin));

        return {
            message:
                `Crawled ${result.companiesCrawled} compan${result.companiesCrawled === 1 ? "y" : "ies"}, ` +
                `upserted ${result.postingsUpserted} posting(s), resolved ${domains.resolved} logo domain(s).`,
        };
    },
);

// Workday proactive crawl (Phase 40/43) — separate cron from the
// Greenhouse/Lever/Ashby one above since Workday's "list mode" (an empty
// searchText against its real CXS search API — confirmed live, see
// lib/proactiveAtsCrawl.ts's own comment) is a genuinely different call
// shape, not a drop-in extension of crawlKnownAtsCompanies. Every 15
// minutes, same reasoning as the other proactive crawl — these are public
// endpoints with no shared quota to protect.
export const proactiveWorkdayCrawlAsync = inngest.createFunction(
    { id: "proactive-workday-crawl", name: "Proactive Workday Crawl", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Proactive Workday crawl");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const result = await step.run("crawl-workday-batch", () => crawlKnownWorkdayCompanies(admin, createCacheDbClient()));

        return {
            message: `Crawled ${result.companiesCrawled} Workday compan${result.companiesCrawled === 1 ? "y" : "ies"}, upserted ${result.postingsUpserted} posting(s).`,
        };
    },
);

// iCIMS proactive crawl (2026-09-03) — third sibling to the two crawls
// above, same cadence and same public-endpoint reasoning (no shared quota
// to protect). Covers the 1,617 iCIMS tenants seeded this session, which
// skew far more cross-industry (healthcare, energy, legal, skilled trades,
// municipal) than the Greenhouse/Lever/Ashby registries do — real coverage
// for candidates outside tech, not just more of the same supply.
export const proactiveIcimsCrawlAsync = inngest.createFunction(
    { id: "proactive-icims-crawl", name: "Proactive iCIMS Crawl", triggers: [{ cron: "*/15 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Proactive iCIMS crawl");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const result = await step.run("crawl-icims-batch", () => crawlKnownIcimsCompanies(admin, createCacheDbClient()));

        return {
            message: `Crawled ${result.companiesCrawled} iCIMS compan${result.companiesCrawled === 1 ? "y" : "ies"}, upserted ${result.postingsUpserted} posting(s).`,
        };
    },
);

// Daily storage maintenance for the crawl cache — see
// pruneStaleDiscoveredPostings for why deleting long-inactive postings is
// safe. Exists because the database is capped at 500 MB and shared with real
// user data; an append-only cache would eventually crowd that out. Daily is
// deliberate: this is housekeeping, not something worth spending an
// invocation on every 15 minutes.
// HOURLY, not daily (2026-09-06). Daily was fine when this only deleted
// long-inactive rows; it is not fine now that it also enforces the cache's
// size budget. Measured growth is roughly 150 MB/day, so a daily run would let
// the database swing ~287 MB -> ~437 MB between passes and drift back toward
// the 500 MB cap it just went over. Hourly keeps the swing near 6 MB.
export const pruneCrawlCacheAsync = inngest.createFunction(
    { id: "prune-crawl-cache", name: "Prune Stale Crawl Cache", triggers: [{ cron: "30 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Crawl-cache prune");

        // No main-project client here: this touches discovered_postings only.
        const pruned = await step.run("prune", () => pruneStaleDiscoveredPostings(createCacheDbClient()));

        // Runs AFTER the stale prune, so anything the prune already removed
        // does not count against the budget and get double-counted here.
        const evicted = await step.run("evict-over-budget", () => evictCachedPostingsOverBudget(createCacheDbClient()));

        return {
            message: `Pruned ${pruned.pruned} long-inactive posting(s); evicted ${evicted.evicted} over the size budget.`,
        };
    },
);

// Periodic Legitimacy recheck (Phase 43/44) — the other half of the
// two-strike rule migrations/20260903120000_add-legitimacy-two-strike-
// recheck.sql introduces. A job sitting at legitimacy_fail_count=1 (either
// freshly flagged by its own first evaluation above, or backfilled there
// from the OLD single-strike-hide rule) needs a SECOND, independent AI
// grade before its status is treated as confirmed — this cron is the only
// code path that can produce that second grade, advance a job to
// fail_count=2/hidden, or clear a probation flag back to 0/visible.
// Deliberately calls evaluateLegitimacyOnly, not evaluateJobCompatibilityLite
// — legitimacy is a fact about the posting, not about any one user's fit
// for it (same "authenticity and fit are orthogonal" principle this file's
// persist-chunk step already established), so this can batch jobs from many
// different users into one recheck call with no profile to load.
// Every 30 minutes, a modest batch size — unlike the free-endpoint ATS
// crawls above, this is a real paid-model call against the shared Gemini
// key, so it's deliberately smaller/slower than those.
//
// Known, accepted imprecision (same posture the 2026-09-01 one-time backfill
// already accepted for its own "is_hidden=true AND match_score IS NOT NULL"
// heuristic): is_hidden is set unconditionally from this recheck's own
// verdict for any job it selects, which could in principle overwrite a
// user's own manual hide on a job that happened to also be on legitimacy
// probation. No separate hidden-reason column exists yet to disambiguate
// that — a real gap, but a narrow and pre-existing one, not introduced by
// this migration.
const LEGITIMACY_RECHECK_BATCH_SIZE = 25;

// Free ATS registry top-up (2026-09-04). jobhive publishes 80,390 companies
// across 65 ATS platforms as a 3.4MB CSV, refreshed hourly, no API key --
// against the ~24,000 our registry had reached. Every company it adds becomes
// a board lib/proactiveAtsCrawl.ts then crawls directly and for free, which
// is how a query like "Financial Advisor"/Toronto stops returning zero from
// our own index.
//
// Weekly, not every 15 minutes: this is a slow-moving directory of which
// employers exist, not a job feed. The crawlers already run continuously and
// are what keep postings fresh. Existing rows are never overwritten (see
// ingestJobhiveRegistry's ignoreDuplicates note), so this can only ever add.
export const jobhiveRegistrySyncAsync = inngest.createFunction(
    { id: "jobhive-registry-sync", name: "Sync Free ATS Company Registry", triggers: [{ cron: "0 5 * * 1" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("ATS registry sync");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const result = await step.run("ingest-registry", () => ingestJobhiveRegistry(admin));

        return {
            message: `Parsed ${result.parsed} rows, mapped ${result.mapped} to supported platforms, upserted ${result.upserted}.`,
            byPlatform: result.byPlatform,
        };
    },
);

export const legitimacyRecheckAsync = inngest.createFunction(
    { id: "legitimacy-recheck", name: "Legitimacy Two-Strike Recheck", triggers: [{ cron: "*/30 * * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Legitimacy recheck");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const result = await step.run("recheck-batch", async () => {
            const { data } = await admin.database
                .from("jobs")
                .select(
                    "id,title,company,location,description,about_role,salary,salary_min,salary_max,job_type,responsibilities,requirements,nice_to_have,benefits",
                )
                .eq("legitimacy_fail_count", 1)
                .order("legitimacy_checked_at", { ascending: true, nullsFirst: true })
                .limit(LEGITIMACY_RECHECK_BATCH_SIZE);

            const candidates = (data as EvaluationJob[] | null) ?? [];
            if (candidates.length === 0) return { rechecked: 0, confirmed: 0, cleared: 0 };

            const results = await evaluateLegitimacyOnly(candidates);
            const byId = new Map(results.map((r) => [r.id, r]));

            let confirmed = 0;
            let cleared = 0;
            await Promise.all(
                candidates.map(async (job) => {
                    const verdict = byId.get(job.id);
                    const failsAgain = verdict?.legitimacyGrade === "D" || verdict?.legitimacyGrade === "F";
                    if (failsAgain) confirmed++;
                    else cleared++;

                    await admin.database
                        .from("jobs")
                        .update({
                            legitimacy_fail_count: failsAgain ? 2 : 0,
                            legitimacy_checked_at: new Date().toISOString(),
                            is_hidden: failsAgain,
                        })
                        .eq("id", job.id);
                }),
            );

            return { rechecked: candidates.length, confirmed, cleared };
        });

        return {
            message: `Rechecked ${result.rechecked} probation job(s) — ${result.confirmed} confirmed (now hidden), ${result.cleared} cleared.`,
        };
    },
);

export const resetLifetimePlanUsagePeriodsAsync = inngest.createFunction(
    { id: "reset-lifetime-plan-usage-periods", name: "Reset Lifetime-Plan Usage Periods", triggers: [{ cron: "0 3 * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("Lifetime plan usage reset");

        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const resetCount = await step.run("roll-expired-periods", async () => {
            const { data: lifetimeTiers } = await admin.database
                .from("subscription_plans")
                .select("tier")
                .eq("billing_period", "lifetime")
                .returns<{ tier: string }[]>();

            const tiers = (lifetimeTiers ?? []).map((p) => p.tier);
            if (tiers.length === 0) return 0;

            const nowIso = new Date().toISOString();
            const { data: expired } = await admin.database
                .from("user_subscriptions")
                .select("user_id,current_period_end")
                .in("tier", tiers)
                .eq("status", "active")
                .lte("current_period_end", nowIso)
                .returns<{ user_id: string; current_period_end: string }[]>();

            for (const row of expired ?? []) {
                const newPeriodStart = new Date(row.current_period_end);
                const newPeriodEnd = new Date(newPeriodStart);
                newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

                await admin.database
                    .from("user_subscriptions")
                    .update({
                        current_period_start: newPeriodStart.toISOString(),
                        current_period_end: newPeriodEnd.toISOString(),
                        updated_at: new Date().toISOString(),
                    })
                    .eq("user_id", row.user_id);
            }

            return (expired ?? []).length;
        });

        return { message: `Rolled ${resetCount} lifetime-plan usage period${resetCount === 1 ? "" : "s"} forward.` };
    },
);

// News section ingestion (build-plan.md, direct user request 2026-08-30).
// Every 6 hours per agy's own velocity research — Hiring & Layoffs and AI &
// Future of Work both run 10-20+ real stories/day, so a 6h cadence keeps
// each tab fresh without over-polling Google News RSS. Each category is a
// separate step so one category's failure (a feed hiccup, a Gemini rate
// limit) doesn't block the other from ingesting.
export const syncNewsItemsAsync = inngest.createFunction(
    { id: "sync-news-items", name: "Sync News Items (Career Radar)", triggers: [{ cron: "0 */6 * * *" }] },
    async ({ step }) => {
        if (crawlPaused()) return pausedResult("News sync");

        const { ingestNewsForCategory } = await import("@/lib/newsIngestion");

        const hiringLayoffs = await step.run("ingest-hiring-layoffs", () => ingestNewsForCategory("hiring_layoffs"));
        const aiFutureOfWork = await step.run("ingest-ai-future-of-work", () => ingestNewsForCategory("ai_future_of_work"));

        return {
            message: `Hiring & Layoffs: +${hiringLayoffs.inserted} (${hiringLayoffs.skipped} skipped). AI & Future of Work: +${aiFutureOfWork.inserted} (${aiFutureOfWork.skipped} skipped).`,
        };
    },
);

// The paid half of a search, moved off the request (2026-09-07).
//
// scrapeAndEvaluateJobs returns as soon as our own index has answered
// (~500ms). LinkedIn and Indeed take 45-73s between them, which is both a poor
// experience and, on Vercel, over the /find-jobs route's 60s maxDuration -- a
// cap-200 search measured ~80s and would have been killed. Here it runs under
// Inngest's budget instead, writes against the same runId, and the client poll
// surfaces the results as they land.
//
// concurrency is capped at 2: this project's Apify plan allows FIVE concurrent
// actor runs in total, and each search launches two (LinkedIn + Indeed). A
// third simultaneous search would exceed the limit and every actor would fail
// with HTTP 402 -- which already happened when the link-rescue path was firing
// its own searches (see reresolveApplyLink's removed tier).
export const fetchPaidSourcesAsync = inngest.createFunction(
    {
        id: "fetch-paid-sources",
        name: "Fetch LinkedIn + Indeed for a search",
        concurrency: { limit: 2 },
        retries: 1,
        triggers: [{ event: "jobs/fetch-paid-sources" }],
    },
    async ({ event, step }) => {
        const data = event.data as {
            userId: string; runId: string | null; title: string; location: string;
            country: string; filters: Record<string, string>; userEmail?: string | null;
        };

        // Each provider in its OWN step, and persistence in a third.
        //
        // Every step.run is a separate HTTP invocation with its own 60s Vercel
        // budget. Running LinkedIn, Indeed, enrichment and persistence together
        // measured 106 SECONDS end-to-end on a real Investment Analyst search
        // -- fine on a laptop, a guaranteed timeout in production, losing
        // results that had already been fetched and paid for. Split, the
        // slowest single step is LinkedIn at ~86s... still over 60s on its own,
        // which is exactly why the item caps below matter and cannot simply be
        // raised without watching this number.
        //
        // Ordered rather than concurrent because Inngest steps are sequential;
        // the cost is wall-clock, not correctness, and the candidate is not
        // blocked on any of it -- the index already answered their search.
        // FOUR fetch steps, not two. Neither actor exposes an offset or page
        // cursor -- checked against their published input schemas -- so more
        // volume cannot come from asking for page 2. What they do expose is
        // sort order, and a relevance-ranked run and a date-ranked run of the
        // same query return overlapping but genuinely different slices. Two
        // runs per provider, unioned and de-duplicated below, is the pagination
        // actually available.
        //
        // It also keeps every step inside its 60s budget, which two steps did
        // not: LinkedIn measured 185 items in 86s. Its per-run cap is now half
        // the configured total (see apifyLinkedInProvider), so each run is
        // ~43s and the pair recovers the volume. Indeed fits its full cap in
        // ~52s, so it keeps it on both runs and simply gains a second slice.
        const fetch1 = (source: "linkedin" | "indeed", variant: "primary" | "secondary") =>
            searchJobs(data.title, data.location, data.country, "serpapi", data.filters.date_posted, undefined, source, variant);

        const liRecent = await step.run("fetch-linkedin-recent", () => fetch1("linkedin", "primary"));
        const liRelevant = await step.run("fetch-linkedin-relevant", () => fetch1("linkedin", "secondary"));
        const indRelevance = await step.run("fetch-indeed-relevance", () => fetch1("indeed", "primary"));
        const indDate = await step.run("fetch-indeed-date", () => fetch1("indeed", "secondary"));

        // De-duplicated by the provider's own id before persistence, so the
        // overlap between two sort orders is paid for once and stored once.
        const seen = new Set<string>();
        const prefetched = [...liRecent, ...liRelevant, ...indRelevance, ...indDate]
            .filter((job) => {
                const key = job.id || job.applyUrl || job.url;
                if (!key || seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        console.log(
            `[fetch-paid-sources] "${data.title}"/"${data.location}": ` +
            `linkedin ${liRecent.length}+${liRelevant.length}, indeed ${indRelevance.length}+${indDate.length} ` +
            `-> ${prefetched.length} unique`,
        );

        const result = await step.run("persist", () =>
            fetchPaidSourcesForRun({ ...data, prefetched }));

        return {
            message: `${data.title} / ${data.location} (${data.country}): ` +
                `${result.providerJobs} from providers, ${result.persisted} persisted.`,
        };
    },
);

// Extraction on OPEN — the cheap half of the split (2026-09-09).
//
// Opening a job used to fire the full 10-dimension rubric, which made every
// click cost a smart-tier call. Making it button-only fixed the cost and
// returned the page to opening bare, because the organised sections come from
// that same pass. Both states had been reported as wrong, at different times,
// by the same person.
//
// This is the resolution: extraction runs on open (cheap, fast tier, no
// candidate profile needed), the rubric stays behind the button. Fire and
// forget, never awaited by the page.
//
// Idempotent by guard, not by luck: the page only emits this for a job whose
// about_role is still empty, and the persist below refuses to overwrite
// anything already present.
export const extractJobDetailsAsync = inngest.createFunction(
    {
        id: "extract-job-details",
        name: "Extract job details (on open)",
        // One per job, so a double-click or a quick back-and-forward cannot
        // pay twice for the same posting.
        concurrency: { limit: 4 },
        retries: 1,
        triggers: [{ event: "jobs/extract-details" }],
    },
    async ({ event, step }) => {
        const { jobId } = event.data as { jobId: string };
        const admin = createAdminClient({
            baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
            apiKey: process.env.INSFORGE_API_KEY!,
        });

        const job = await step.run("load-job", async () => {
            const { data, error } = await admin.database
                .from("jobs")
                .select("id,title,company,location,description,about_role,salary,salary_min,salary_max,job_type")
                .eq("id", jobId)
                .maybeSingle();
            if (error) throw new Error(`extract: load failed for ${jobId}: ${error.message}`);
            return data as EvaluationJob | null;
        });
        if (!job) return { message: `job ${jobId} not found` };
        if (job.about_role) return { message: `job ${jobId} already extracted` };

        const [extracted] = await step.run("extract", () => extractJobDetails([job]));
        if (!extracted) return { message: `extraction returned nothing for ${jobId}` };

        await step.run("persist", async () => {
            const { error } = await admin.database
                .from("jobs")
                .update({
                    about_role: extracted.aboutRole || null,
                    responsibilities: extracted.responsibilities || [],
                    requirements: extracted.requirements || [],
                    nice_to_have: extracted.niceToHave || [],
                    benefits: extracted.benefits || [],
                    hiring_process: extracted.hiringProcess || [],
                    // Fallback only — never overwrite a real structured value
                    // the search or the lite pass already established.
                    ...(job.salary ? {} : { salary: extracted.salary || null }),
                    // Denormalised onto the job so the client-side filter can
                    // read them without a cross-database join. company_domains
                    // remains the shared source of truth.
                    ...(extracted.industry ? { company_industry: extracted.industry } : {}),
                    ...(extracted.companyStage ? { company_stage: extracted.companyStage } : {}),
                })
                .eq("id", jobId);
            if (error) throw new Error(`extract: persist failed for ${jobId}: ${error.message}`);
        });

        // Same employer-level sharing as the full pass: a domain learned here
        // serves every other posting from this company, for every user.
        if (extracted.companyDomain && job.company) {
            await step.run("share-company-domain", async () => {
                const { error } = await createCacheDbClient()
                    .database.from("company_domains")
                    .upsert(
                        {
                            company_key: canonicalCompanyKey(job.company as string),
                            company_name: job.company,
                            domain: extracted.companyDomain,
                            // Company-level facts, shared the same way the
                            // domain is: one posting teaches us the employer's
                            // sector and every other posting from them benefits.
                            ...(extracted.industry ? { industry: extracted.industry } : {}),
                            ...(extracted.companyStage ? { company_stage: extracted.companyStage } : {}),
                            resolved_at: new Date().toISOString(),
                        },
                        { onConflict: "company_key", ignoreDuplicates: false },
                    );
                if (error) console.warn(`[extract-job-details] domain share failed: ${error.message}`);
            });
        }

        return { message: `extracted ${jobId}${extracted.companyDomain ? ` (+${extracted.companyDomain})` : ""}` };
    },
);
