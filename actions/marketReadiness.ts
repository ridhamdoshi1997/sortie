"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveModelForUser } from "@/lib/subscription";
import { checkAndConsumeUsage } from "@/lib/usage";
import { generateMarketReadinessNarrative, type AccomplishmentLite, type MarketReadinessResult } from "@/lib/marketReadiness";
import type { Profile } from "@/types";

// Same honesty-sample-size convention as lib/outcomeInsights.ts's
// MIN_SAMPLE_SIZE — a "trend" read off 1-2 accomplishments is noise
// dressed up as a pattern.
const MIN_ACCOMPLISHMENTS = 3;

type MarketReadinessActionResult =
  | { success: true; result: MarketReadinessResult }
  | { success: false; error: string };

// Opt-in, button-triggered (never eager) — same pattern as
// generateOutcomeNarrativeAction/generateBragDocAction. Recomputes from a
// fresh server-side read rather than trusting client-supplied data.
export async function generateMarketReadinessAction(): Promise<MarketReadinessActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "market_readiness");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: profile }, { data: accomplishments }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("preferred_model,job_titles_seeking")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "preferred_model" | "job_titles_seeking">>(),
      insforge.database
        .from("accomplishments")
        .select("title,description,date,tags")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(30),
    ]);

    const accomplishmentRows = (accomplishments ?? []) as AccomplishmentLite[];

    if (accomplishmentRows.length < MIN_ACCOMPLISHMENTS) {
      return {
        success: false,
        error: `Log at least ${MIN_ACCOMPLISHMENTS} accomplishments first — there isn't enough data yet for a meaningful read.`,
      };
    }

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile?.preferred_model);
    const result = await generateMarketReadinessNarrative(accomplishmentRows, profile?.job_titles_seeking ?? [], provider, tier);

    return { success: true, result };
  } catch (error) {
    console.error("[actions/marketReadiness] generateMarketReadinessAction", error);
    return { success: false, error: "Failed to generate a market readiness read." };
  }
}
