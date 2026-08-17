"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import {
  computeInterviewRateByGrade,
  computeInterviewRateByMatchBand,
  computeRejectionReasonDistribution,
  hasEnoughDataForInsights,
  type ApplicationEventLite,
  type GradeStat,
  type MatchScoreBandStat,
  type OutcomeJob,
  type RejectionCategoryStat,
} from "@/lib/outcomeInsights";
import { generateOutcomeNarrative, type OutcomeNarrativeResult } from "@/lib/outcomeNarrative";
import type { Profile } from "@/types";

export type OutcomeStats = {
  hasEnoughData: boolean;
  byMatchBand: MatchScoreBandStat[];
  byGrade: GradeStat[];
  rejectionReasons: RejectionCategoryStat[];
};

// §Q3 — deterministic, zero-AI aggregation over the user's own already-
// stored jobs + application_events (§Q1). Always computed on /career load
// (cheap: two DB reads + pure math, no usage cap needed), unlike the
// optional AI narrative below which IS usage-gated.
export async function getOutcomeStats(): Promise<{ success: boolean; data?: OutcomeStats; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const [{ data: jobs }, { data: events }] = await Promise.all([
      insforge.database
        .from("jobs")
        .select("id,match_score,overall_grade,application_status,rejection_diagnosis")
        .eq("user_id", user.id),
      insforge.database.from("application_events").select("job_id,event_type").eq("user_id", user.id),
    ]);

    const outcomeJobs = (jobs ?? []) as OutcomeJob[];
    const outcomeEvents = (events ?? []) as ApplicationEventLite[];

    return {
      success: true,
      data: {
        hasEnoughData: hasEnoughDataForInsights(outcomeJobs),
        byMatchBand: computeInterviewRateByMatchBand(outcomeJobs, outcomeEvents),
        byGrade: computeInterviewRateByGrade(outcomeJobs, outcomeEvents),
        rejectionReasons: computeRejectionReasonDistribution(outcomeJobs),
      },
    };
  } catch (error) {
    console.error("[actions/outcomeInsights] getOutcomeStats", error);
    return { success: false, error: "Failed to load your outcome stats" };
  }
}

// Opt-in, button-triggered (never eager) — turns the stats above into 1-2
// plain-English observations. Recomputes the stats server-side rather than
// trusting client-supplied numbers, so the AI call is always grounded in a
// fresh read of the user's real data.
export async function generateOutcomeNarrativeAction(): Promise<{
  success: boolean;
  narrative?: OutcomeNarrativeResult;
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "outcome_narrative");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: profile }, { data: jobs }, { data: events }] = await Promise.all([
      insforge.database.from("profiles").select("preferred_model").eq("id", user.id).maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("jobs")
        .select("id,match_score,overall_grade,application_status,rejection_diagnosis")
        .eq("user_id", user.id),
      insforge.database.from("application_events").select("job_id,event_type").eq("user_id", user.id),
    ]);

    const outcomeJobs = (jobs ?? []) as OutcomeJob[];
    const outcomeEvents = (events ?? []) as ApplicationEventLite[];

    if (!hasEnoughDataForInsights(outcomeJobs)) {
      return { success: false, error: "Not enough tracked applications yet for a meaningful summary." };
    }

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const narrative = await generateOutcomeNarrative(
      computeInterviewRateByMatchBand(outcomeJobs, outcomeEvents),
      computeInterviewRateByGrade(outcomeJobs, outcomeEvents),
      computeRejectionReasonDistribution(outcomeJobs),
      provider,
    );

    return { success: true, narrative };
  } catch (error) {
    console.error("[actions/outcomeInsights] generateOutcomeNarrativeAction", error);
    return { success: false, error: "Failed to generate an outcome summary" };
  }
}
