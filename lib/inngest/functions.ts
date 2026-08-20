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
                        admin.database.from("profiles").select("preferred_model,email").eq("id", userId).maybeSingle<Pick<Profile, "preferred_model" | "email">>(),
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

                const provider = resolveProvider(profile?.preferred_model, profile?.email ?? undefined);
                const result = await generateWeeklyBriefing(snapshot, provider);

                await admin.database
                    .from("profiles")
                    .update({ weekly_briefing: result.summary, weekly_briefing_generated_at: new Date().toISOString() })
                    .eq("id", userId);
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