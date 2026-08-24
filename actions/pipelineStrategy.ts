"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import {
  computePipelineSnapshot,
  generatePipelineStrategyRead,
  MIN_ACTIVE_JOBS_FOR_READ,
  type PipelineSnapshot,
  type PipelineStrategyResult,
} from "@/lib/pipelineStrategy";
import type { Profile } from "@/types";

type SnapshotResult = { success: true; snapshot: PipelineSnapshot } | { success: false; error: string };

// Zero-AI aggregation, read on every /dashboard visit — same "plain DB
// query + counting, no usage gate" shape as getSkillGaps.
export async function getPipelineSnapshot(): Promise<SnapshotResult> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: jobs } = await insforge.database
      .from("jobs")
      .select("application_status,match_score,is_hidden,marked_unavailable_at,dropped_from_search_at,found_at")
      .eq("user_id", user.id)
      .returns<
        {
          application_status: string;
          match_score: number | null;
          is_hidden: boolean;
          marked_unavailable_at: string | null;
          dropped_from_search_at: string | null;
          found_at: string | null;
        }[]
      >();

    const snapshot = computePipelineSnapshot(
      (jobs ?? []) as (Omit<NonNullable<typeof jobs>[number], "application_status"> & {
        application_status: PipelineSnapshot["stages"][number]["stage"];
      })[],
    );

    return { success: true, snapshot };
  } catch (error) {
    console.error("[actions/pipelineStrategy] getPipelineSnapshot", error);
    return { success: false, error: "Failed to load your pipeline snapshot." };
  }
}

type ReadActionResult = { success: true; result: PipelineStrategyResult } | { success: false; error: string };

// Opt-in, button-triggered AI synthesis over the already-computed real
// snapshot — same pattern as generateSkillGapPathingAction.
export async function generatePipelineStrategyReadAction(): Promise<ReadActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "pipeline_strategy_read");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const snapshotResult = await getPipelineSnapshot();
    if (!snapshotResult.success) {
      return { success: false, error: snapshotResult.error };
    }
    if (snapshotResult.snapshot.totalActive < MIN_ACTIVE_JOBS_FOR_READ) {
      return {
        success: false,
        error: `Track at least ${MIN_ACTIVE_JOBS_FOR_READ} active jobs first — there isn't enough pipeline data yet for a meaningful read.`,
      };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();
    const provider = resolveProvider(profile?.preferred_model, user.email);

    const result = await generatePipelineStrategyRead(snapshotResult.snapshot, provider);
    return { success: true, result };
  } catch (error) {
    console.error("[actions/pipelineStrategy] generatePipelineStrategyReadAction", error);
    return { success: false, error: "Failed to generate a pipeline strategy read." };
  }
}
