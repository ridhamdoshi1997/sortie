"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { inngest } from "@/lib/inngest/client";
import { fetchViaJinaReader } from "@/agent/research";
import { trackPostHogEvent } from "@/lib/posthog-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import { diagnoseRejectionForJob, type RejectionDiagnosisResult } from "@/lib/rejectionIntelligence";
import { researchStrategicMoat, type StrategicMoatBriefing } from "@/agent/research";
import { synthesizeLeverageForJob, type LeverageSynthesisResult } from "@/lib/leverageSynthesizer";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import type { OfferDetails } from "@/lib/equityDecoder";
import type { TaxEstimateInputs } from "@/lib/taxCalculator";
import type { ApplicationStatus } from "@/lib/applicationStatus";
import type { EvaluationDimensionResult } from "@/lib/evaluator";
import type { Profile } from "@/types";

type ActionResult = { success: boolean; error?: string };

type AddExternalJobInput = {
  title: string;
  company: string;
  location?: string;
  description: string;
  url?: string;
};

// Same evaluation pipeline lib/actions/scraper.actions.ts's search flow uses
// (jobs/evaluate Inngest event -> evaluateJobsAsync -> evaluator.ts) — a
// manually-pasted job only needs id/title/company/description to run
// through it, everything else is nullable there already.
export async function fetchExternalJobText(url: string): Promise<{ text: string | null }> {
  await requireUser();
  const text = await fetchViaJinaReader(url);
  return { text: text ? text.slice(0, 12000) : null };
}

export async function addExternalJob(input: AddExternalJobInput): Promise<ActionResult & { jobId?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: job, error } = await insforge.database
      .from("jobs")
      .insert([
        {
          user_id: user.id,
          source: "url",
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
      console.error("[actions/jobs] addExternalJob", error);
      return { success: false, error: "Failed to save job" };
    }

    await inngest.send({
      name: "jobs/evaluate",
      data: { jobIds: [job.id], filters: {}, userId: user.id, runId: null },
    });

    revalidatePath("/jobs/external");
    return { success: true, jobId: job.id };
  } catch (error) {
    console.error("[actions/jobs] addExternalJob", error);
    return { success: false, error: "Failed to save job" };
  }
}

export async function toggleSaveJob(jobId: string, saved: boolean): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ is_saved: saved })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] toggleSaveJob", error);
      return { success: false, error: "Failed to update saved status" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] toggleSaveJob", error);
    return { success: false, error: "Failed to update saved status" };
  }
}

export async function toggleHideJob(jobId: string, hidden: boolean): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ is_hidden: hidden })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] toggleHideJob", error);
      return { success: false, error: "Failed to update hidden status" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] toggleHideJob", error);
    return { success: false, error: "Failed to update hidden status" };
  }
}

// Reversible status transition — the Kanban board's drag-and-drop and every
// other status-change surface (JobActionBar, JobResultCard) route through
// this one action, following toggleSaveJob's optimistic-then-write shape
// rather than the old markApplied's one-way write. `from` comes from the
// caller's already-known client state (same idiom JobActionBar already uses
// for its optimistic local state) rather than an extra fetch-before-write —
// it's only used for the PostHog event, not for any server-side validation.
export async function setApplicationStatus(
  jobId: string,
  from: ApplicationStatus,
  to: ApplicationStatus,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ application_status: to, application_status_updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] setApplicationStatus", error);
      return { success: false, error: "Failed to update application status" };
    }

    await trackPostHogEvent({
      event: "application_status_changed",
      properties: { userId: user.id, jobId, from, to },
    });

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] setApplicationStatus", error);
    return { success: false, error: "Failed to update application status" };
  }
}

// User-confirmed "this listing is gone" — the highest-confidence signal in
// lib/jobStatus.ts's getListingSignal, above the automatic dropped-from-
// search detection. Reversible (unmarkJobUnavailable below), same spirit as
// toggleSaveJob/toggleHideJob rather than a one-way action.
export async function markJobUnavailable(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ marked_unavailable_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] markJobUnavailable", error);
      return { success: false, error: "Failed to update this listing" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/saved-jobs");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] markJobUnavailable", error);
    return { success: false, error: "Failed to update this listing" };
  }
}

export async function unmarkJobUnavailable(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ marked_unavailable_at: null })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] unmarkJobUnavailable", error);
      return { success: false, error: "Failed to update this listing" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/saved-jobs");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] unmarkJobUnavailable", error);
    return { success: false, error: "Failed to update this listing" };
  }
}

// Lets the candidate fix a wrong AI call (e.g. "I actually do have this
// skill") without re-running the evaluator — a data correction, not a new
// AI call, so match_score/recommendation_score are deliberately left alone.
export async function correctSkillTag(
  jobId: string,
  skill: string,
  moveTo: "matched" | "missing",
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: job, error: fetchError } = await insforge.database
      .from("jobs")
      .select("matched_skills,missing_skills")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ matched_skills: string[] | null; missing_skills: string[] | null }>();

    if (fetchError || !job) {
      console.error("[actions/jobs] correctSkillTag fetch", fetchError);
      return { success: false, error: "Failed to load job" };
    }

    const matched = new Set(job.matched_skills ?? []);
    const missing = new Set(job.missing_skills ?? []);
    matched.delete(skill);
    missing.delete(skill);
    (moveTo === "matched" ? matched : missing).add(skill);

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({
        matched_skills: Array.from(matched),
        missing_skills: Array.from(missing),
      })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] correctSkillTag update", updateError);
      return { success: false, error: "Failed to save correction" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] correctSkillTag", error);
    return { success: false, error: "Failed to save correction" };
  }
}

// "Why did this employer go silent?" — grounded entirely in the job's own
// already-stored evaluation (see lib/rejectionIntelligence.ts's own header
// comment on why this can never be a real answer, only a plausible one).
// Gated by checkAndConsumeUsage since it's a real LLM call, same pattern as
// every other AI-backed action in this codebase.
export async function diagnoseRejection(
  jobId: string,
): Promise<ActionResult & { diagnosis?: RejectionDiagnosisResult }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "rejection_intelligence");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: profile }, { data: job }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("preferred_model")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("jobs")
        .select("id,title,company,description,evaluation,missing_skills,application_status_updated_at")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle<{
          id: string;
          title: string | null;
          company: string | null;
          description: string | null;
          evaluation: EvaluationDimensionResult[] | null;
          missing_skills: string[] | null;
          application_status_updated_at: string | null;
        }>(),
    ]);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const diagnosis = await diagnoseRejectionForJob(job, provider);

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({ rejection_diagnosis: diagnosis, rejection_diagnosed_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] diagnoseRejection persist", updateError);
      return { success: false, error: "Diagnosis generated but failed to save" };
    }

    revalidatePath("/missions");
    return { success: true, diagnosis };
  } catch (error) {
    console.error("[actions/jobs] diagnoseRejection", error);
    return { success: false, error: "Failed to generate a diagnosis" };
  }
}

// Distinct from the existing free CompanyResearch dossier — recent news,
// strategic priorities, and existential threats, not culture/tech-stack.
// Opt-in (button-triggered, not auto-loaded like CompanyResearchAutoLoader)
// since this can fall to the real-cost Perplexity path (see
// researchStrategicMoat's own comment) — an opt-in cost-bearing action
// shouldn't fire without a click, same principle as Insider Connections.
export async function getStrategicMoatBriefing(
  jobId: string,
): Promise<ActionResult & { briefing?: StrategicMoatBriefing }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "strategic_moat");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: job } = await insforge.database
      .from("jobs")
      .select("id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{
        id: string;
        title: string | null;
        company: string | null;
        source_url: string | null;
        external_apply_url: string | null;
        about_role: string | null;
        matched_skills: string[] | null;
        missing_skills: string[] | null;
      }>();

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const result = await researchStrategicMoat({
      ...job,
      matched_skills: job.matched_skills ?? [],
      missing_skills: job.missing_skills ?? [],
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({ strategic_moat: result.briefing, strategic_moat_researched_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] getStrategicMoatBriefing persist", updateError);
      return { success: false, error: "Briefing generated but failed to save" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true, briefing: result.briefing };
  } catch (error) {
    console.error("[actions/jobs] getStrategicMoatBriefing", error);
    return { success: false, error: "Failed to generate a strategic briefing" };
  }
}

// Equity & Cap Table Decoder — plain data write, no AI/paid call involved
// (lib/equityDecoder.ts's decodeOffer runs client-side on these same
// numbers), so this isn't usage-gated like the AI actions above.
export async function saveOfferDetails(jobId: string, details: OfferDetails): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ offer_details: details, offer_details_updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] saveOfferDetails", error);
      return { success: false, error: "Failed to save offer details" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] saveOfferDetails", error);
    return { success: false, error: "Failed to save offer details" };
  }
}

// Tax Calculator — same "plain data write, no AI/paid call" shape as
// saveOfferDetails above (lib/taxCalculator.ts's calculateTakeHome runs
// client-side). Kept in its own column so this tab's save can't clobber the
// Equity Decoder tab's fields or vice versa.
export async function saveTaxEstimateInputs(jobId: string, inputs: TaxEstimateInputs): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ tax_estimate_inputs: inputs, tax_estimate_inputs_updated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] saveTaxEstimateInputs", error);
      return { success: false, error: "Failed to save tax calculator inputs" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] saveTaxEstimateInputs", error);
    return { success: false, error: "Failed to save tax calculator inputs" };
  }
}

// Post-Offer Leverage Synthesizer — grounded entirely in this job's own
// already-stored data (evaluation, timing, reappearance signal) — see
// lib/leverageSynthesizer.ts's header comment on why this can never cite
// real market data. Gated by checkAndConsumeUsage since it's a real LLM
// call, same pattern as diagnoseRejection/getStrategicMoatBriefing above.
export async function synthesizeLeverage(
  jobId: string,
): Promise<ActionResult & { synthesis?: LeverageSynthesisResult }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "leverage_synthesis");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: profile }, { data: job }, { data: allJobsForSignal }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("preferred_model")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("jobs")
        .select(
          "id,title,company,evaluation,missing_skills,match_score,title_scope_mismatch,found_at,application_status_updated_at,offer_details",
        )
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle<{
          id: string;
          title: string | null;
          company: string | null;
          evaluation: EvaluationDimensionResult[] | null;
          missing_skills: string[] | null;
          match_score: number | null;
          title_scope_mismatch: { flagged: boolean; note: string } | null;
          found_at: string | null;
          application_status_updated_at: string | null;
          offer_details: OfferDetails | null;
        }>(),
      insforge.database.from("jobs").select("company,title,found_at").eq("user_id", user.id),
    ]);

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const reappearanceSignal = getReappearanceSignal(job, computeReappearanceCounts(allJobsForSignal ?? []));

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const synthesis = await synthesizeLeverageForJob(
      {
        ...job,
        offerEntered: job.offer_details !== null,
        reappearanceLabel: reappearanceSignal?.label ?? null,
      },
      provider,
    );

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({ leverage_synthesis: synthesis, leverage_synthesized_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] synthesizeLeverage persist", updateError);
      return { success: false, error: "Synthesis generated but failed to save" };
    }

    revalidatePath("/missions");
    revalidatePath("/find-jobs/[id]", "page");
    return { success: true, synthesis };
  } catch (error) {
    console.error("[actions/jobs] synthesizeLeverage", error);
    return { success: false, error: "Failed to generate a leverage synthesis" };
  }
}
