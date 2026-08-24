"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import {
  generateBragDoc,
  type BragDocAccomplishment,
  type BragDocCompensationEvent,
  type BragDocResult,
} from "@/lib/bragDoc";
import type { Profile } from "@/types";

// §Q4 Brag Doc generator — opt-in, date-range-scoped, usage-gated (same
// shape as actions/outcomeInsights.ts's generateOutcomeNarrativeAction).
// Not persisted: the result is ephemeral, held in client state and passed
// back to /api/career/brag-doc for PDF rendering rather than re-fetched
// from a table, since there's no standing "brag doc" table in v1.
export async function generateBragDocAction(
  startDate: string,
  endDate: string,
): Promise<{ success: boolean; bragDoc?: BragDocResult; error?: string }> {
  const user = await requireUser();

  if (!startDate || !endDate || startDate > endDate) {
    return { success: false, error: "Pick a valid date range." };
  }

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "brag_doc");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: profile }, { data: accomplishments }, { data: compEvents }] = await Promise.all([
      insforge.database.from("profiles").select("preferred_model").eq("id", user.id).maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("accomplishments")
        .select("title,description,date,tags")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .returns<BragDocAccomplishment[]>(),
      insforge.database
        .from("compensation_events")
        .select("event_type,effective_date,notes")
        .eq("user_id", user.id)
        .gte("effective_date", startDate)
        .lte("effective_date", endDate)
        .order("effective_date", { ascending: true })
        .returns<BragDocCompensationEvent[]>(),
    ]);

    if (!accomplishments || accomplishments.length === 0) {
      return { success: false, error: "No accomplishments logged in this date range yet — add some on /career first." };
    }

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const bragDoc = await generateBragDoc(accomplishments, compEvents ?? [], provider);

    return { success: true, bragDoc };
  } catch (error) {
    console.error("[actions/bragDoc] generateBragDocAction", error);
    return { success: false, error: "Failed to generate your brag doc" };
  }
}
