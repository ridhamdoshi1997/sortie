import { inngest } from "./client";
import { createInsforgeServer } from "@/lib/insforge-server";
import { evaluateJobCompatibility } from "@/lib/evaluator";
import { createAdminClient } from '@insforge/sdk';

function chunkArray<T>(arr: T[], size: number): T[][] {
    return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );
}

type EvaluationResult = {
    id: string;
    score?: number;
    reasoning?: string;
    matchedSkills?: string[];
    missingSkills?: string[];
};

export const evaluateJobsAsync = inngest.createFunction(
    {
        id: "evaluate-jobs",
        name: "Evaluate Scraped Jobs via Gemini",
        triggers: [{ event: "jobs/evaluate" }]
    },
    async ({ event, step }: any) => {
        const { jobIds, filters, userId, runId } = event.data as {
            jobIds: string[];
            filters: Record<string, string>;
            userId: string;
            runId?: string | null;
        };

        console.log("🔍 [Inngest] Received jobIds:", jobIds);

        const startedAtMs = Date.now();
        const insforge = await createInsforgeServer();
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

        const { data: rawJobs, error } = await insforge.database
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

        const jobChunks = chunkArray(rawJobs, 10);

        try {
            for (const chunk of jobChunks) {
                await step.run(`Evaluate Chunk of ${chunk.length}`, async () => {
                    const evaluations = await evaluateJobCompatibility(chunk, filters);

                    for (const job of chunk) {
                        const evalResult = evaluations.find((e: any) => e.id === job.id) || {};

                        // Capture the error from the database update
                        const { error: updateError } = await admin.database
                            .from("jobs")
                            .update({
                                match_score: evalResult.score ?? 0,
                                match_reason: evalResult.reasoning || null,
                                matched_skills: evalResult.matchedSkills || [],
                                missing_skills: evalResult.missingSkills || [],
                            })
                            .eq("id", job.id);

                        // Force a crash if the database rejects the save
                        if (updateError) {
                            throw new Error(`Database Update Failed for Job ${job.id}: ${updateError.message}`);
                        }
                    }
                });

                await step.sleep("delay-between-ai-calls", "3s");
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