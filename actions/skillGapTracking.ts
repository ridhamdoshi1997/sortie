"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProviderForUser } from "@/lib/subscription";
import { checkAndConsumeUsage } from "@/lib/usage";
import { aggregateSkillGaps, generateSkillGapPathing, MIN_JOBS_FOR_PATTERN, type SkillGap, type SkillGapPathingResult } from "@/lib/skillGapTracking";
import type { Profile } from "@/types";

type GapsResult = { success: true; gaps: SkillGap[]; jobCount: number } | { success: false; error: string };

// Zero-AI aggregation, read on every /career visit (no usage gate — it's a
// plain DB query + counting, same cost shape as any other page-load read).
export async function getSkillGaps(): Promise<GapsResult> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: jobs } = await insforge.database
      .from("jobs")
      .select("missing_skills")
      .eq("user_id", user.id)
      .not("missing_skills", "is", null);

    const rows = (jobs ?? []) as { missing_skills: string[] | null }[];
    const gaps = aggregateSkillGaps(rows.map((j) => j.missing_skills));

    return { success: true, gaps, jobCount: rows.length };
  } catch (error) {
    console.error("[actions/skillGapTracking] getSkillGaps", error);
    return { success: false, error: "Failed to load your skill-gap pattern." };
  }
}

// Skills radar chart (build-plan.md §H) — same zero-AI aggregation shape
// as getSkillGaps above, just counting matched_skills instead of
// missing_skills. Real strengths from the user's own evaluated jobs, not a
// self-reported profile list.
export async function getMatchedSkills(): Promise<GapsResult> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: jobs } = await insforge.database
      .from("jobs")
      .select("matched_skills")
      .eq("user_id", user.id)
      .not("matched_skills", "is", null);

    const rows = (jobs ?? []) as { matched_skills: string[] | null }[];
    const gaps = aggregateSkillGaps(rows.map((j) => j.matched_skills), 8);

    return { success: true, gaps, jobCount: rows.length };
  } catch (error) {
    console.error("[actions/skillGapTracking] getMatchedSkills", error);
    return { success: false, error: "Failed to load your matched-skills pattern." };
  }
}

type PathingActionResult = { success: true; result: SkillGapPathingResult } | { success: false; error: string };

// Opt-in, button-triggered AI synthesis over the already-computed real
// gaps — same pattern as generateMarketReadinessAction.
export async function generateSkillGapPathingAction(): Promise<PathingActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "skill_gap_synthesis");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const gapsResult = await getSkillGaps();
    if (!gapsResult.success) {
      return { success: false, error: gapsResult.error };
    }
    if (gapsResult.jobCount < MIN_JOBS_FOR_PATTERN || gapsResult.gaps.length === 0) {
      return { success: false, error: `Evaluate at least ${MIN_JOBS_FOR_PATTERN} jobs first — there isn't enough data yet for a meaningful pattern.` };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();
    const provider = await resolveProviderForUser(insforge, user.id, user.email, profile?.preferred_model);

    const result = await generateSkillGapPathing(gapsResult.gaps, provider);
    return { success: true, result };
  } catch (error) {
    console.error("[actions/skillGapTracking] generateSkillGapPathingAction", error);
    return { success: false, error: "Failed to generate career-pathing advice." };
  }
}
