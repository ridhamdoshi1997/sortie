import { inngest } from "./client";
import { resolveProvider } from "@/lib/access";
import { evaluateJobCompatibility, type SkillCorrection } from "@/lib/evaluator";
import { generateResumeUpdateSuggestion } from "@/lib/resumeSuggestions";
import { checkAndConsumeUsage } from "@/lib/usage";
import { createAdminClient } from '@insforge/sdk';
import type { Profile, WorkExperience } from "@/types";

function chunkArray<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

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

        const { data: rawJobs, error } = await admin.database
            .from("jobs")
            .select("*")
            .in("id", jobIds);

        console.log("🔍 [Inngest] Database returned jobs count:", rawJobs?.length);

        if (error) {
            console.error("🔍 [Inngest] DB Query Error:", error);
            await markRunFailed(`Failed to fetch jobs from DB: ${error.message}`);
            throw new Error(`Failed to fetch jobs from DB: ${error.message}`);
        }

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

        const provider = resolveProvider(profile.preferred_model, profile.email);
        // Chunk size dropped from 10 to 5 (2026-07-20) — verified live that
        // the richer 2-3 sentence per-dimension notes cause the model to
        // silently under-deliver a 10-job batch (only ~2 of 10 jobs actually
        // evaluated, the rest fell back to neutral placeholders, even at a
        // 24000-token budget — not a truncation issue, the model just stops
        // completing the full batch). Chunk size 5 passed 3/3 live test runs
        // with zero fallbacks; size 8 already failed the same way size 10 did.
        const jobChunks = chunkArray(rawJobs, 5);

        try {
            for (const [chunkIndex, chunk] of jobChunks.entries()) {
                await step.run(`evaluate-chunk-${chunkIndex}`, async () => {
                    const evaluations = await evaluateJobCompatibility(
                        chunk,
                        filters,
                        profile,
                        provider,
                        (corrections ?? []) as SkillCorrection[],
                    );

                    for (const job of chunk) {
                        const evalResult = evaluations.find((e) => e.id === job.id);

                        // Capture the error from the database update
                        const { error: updateError } = await admin.database
                            .from("jobs")
                            .update({
                                match_score: evalResult?.matchScore ?? 0,
                                match_reason: evalResult?.reasoning || null,
                                matched_skills: evalResult?.matchedSkills || [],
                                missing_skills: evalResult?.missingSkills || [],
                                evaluation: evalResult?.dimensions ?? null,
                                recommendation_score: evalResult?.recommendationScore ?? null,
                                overall_grade: evalResult?.overallGrade ?? null,
                                responsibilities: evalResult?.responsibilities || [],
                                requirements: evalResult?.requirements || [],
                                nice_to_have: evalResult?.niceToHave || [],
                                benefits: evalResult?.benefits || [],
                                about_role: evalResult?.aboutRole || null,
                                hiring_process: evalResult?.hiringProcess || [],
                                seniority_level: evalResult?.seniorityLevel || null,
                                years_experience_required: evalResult?.yearsExperienceRequired || null,
                                title_scope_mismatch: evalResult?.titleScopeMismatch ?? null,
                                // Fallback only — never overwrite a real
                                // structured salary already on the row
                                // (e.g. from the scraper's own source data).
                                ...(job.salary ? {} : { salary: evalResult?.salary || null }),
                                // Fallback only — never overwrite a real
                                // scraped thumbnail from SerpApi. Built from
                                // the model's own knowledge of the company's
                                // real domain (see companyDomain's comment in
                                // evaluator.ts), not the old naive
                                // lowercase-the-name guess — that guess is
                                // what actually caused most missing/wrong
                                // logos, confirmed live 2026-07-28. Source is
                                // unavatar.io, not Clearbit — Clearbit's Logo
                                // API turned out to be fully DNS-dead as of
                                // 2026-07-28 (confirmed live), not
                                // ad-blocker-blocked as first guessed.
                                ...(job.company_logo_url || !evalResult?.companyDomain
                                    ? {}
                                    : { company_logo_url: `https://unavatar.io/${evalResult.companyDomain}?fallback=false` }),
                            })
                            .eq("id", job.id);

                        // Force a crash if the database rejects the save
                        if (updateError) {
                            throw new Error(`Database Update Failed for Job ${job.id}: ${updateError.message}`);
                        }
                    }
                });

                await step.sleep(`delay-between-ai-calls-${chunkIndex}`, "3s");
            }
        } catch (err) {
            console.error("Chunk evaluation failed:", err);
            await markRunFailed((err as Error).message);
            throw err; // Ensure Inngest catches this so the run fails visibly
        }

        if (runId) {
            await admin.database
                .from("agent_runs")
                .update({
                    status: "completed",
                    is_successful: true,
                    total_time_ms: Date.now() - startedAtMs,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", runId);
        }

        return { message: `Successfully evaluated ${rawJobs.length} jobs.` };
    }
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
        const provider = resolveProvider(profile?.preferred_model, profile?.email);

        const bullet = await step.run("generate-suggestion", () =>
            generateResumeUpdateSuggestion(accomplishment.title, accomplishment.description, role, provider),
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