import { inngest } from "@/lib/inngest/client";
import type { createInsforgeServer } from "@/lib/insforge-server";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

export type ExternalJobInput = {
  title: string;
  company: string;
  location?: string;
  description: string;
  url?: string;
  // Which platform this was captured from (extension only) — absent for
  // the manual "paste a job from anywhere" flow, which has no platform to
  // detect and keeps the original generic "url" source.
  source?:
    | "linkedin"
    | "indeed"
    | "simplyhired"
    | "dice"
    | "careerbuilder"
    | "remoteok"
    | "monster"
    | "weworkremotely"
    | "builtin"
    | "ziprecruiter";
};

export type CreateExternalJobResult =
  | { success: true; jobId: string }
  | { success: false; error: string };

// Shared by actions/jobs.ts's addExternalJob (cookie-authed, the existing
// "paste a job from anywhere" flow) and §Q5's
// app/api/extension/capture-job/route.ts (bearer-token-authed, no request
// cookies available) — both need the exact same job-row-plus-evaluation-
// trigger logic, just a different way of resolving which user it's for.
export async function createExternalJob(
  insforge: Insforge,
  userId: string,
  input: ExternalJobInput,
): Promise<CreateExternalJobResult> {
  const { data: job, error } = await insforge.database
    .from("jobs")
    .insert([
      {
        user_id: userId,
        source: input.source ?? "url",
        external_id: crypto.randomUUID(),
        title: input.title,
        company: input.company,
        location: input.location || null,
        description: input.description,
        url: input.url || null,
      },
    ])
    .select("id")
    .single<{ id: string }>();

  if (error || !job) {
    console.error("[lib/externalJob] createExternalJob", error);
    return { success: false, error: "Failed to save job" };
  }

  // Real bug found live 2026-08-17: an unguarded inngest.send() failure here
  // used to throw and fail the whole call even though the job row above had
  // already saved successfully — the save is the actual side effect that
  // matters; a failed evaluation-trigger just means the job stays
  // unscored, not that the capture itself should read as failed.
  try {
    await inngest.send({
      name: "jobs/evaluate",
      data: { jobIds: [job.id], filters: {}, userId, runId: null },
    });
  } catch (sendError) {
    console.error("[lib/externalJob] createExternalJob: failed to queue evaluation", sendError);
  }

  return { success: true, jobId: job.id };
}
