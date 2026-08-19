"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createExternalJob } from "@/lib/externalJob";
import { fetchViaJinaReader, researchCompany } from "@/agent/research";
import { trackPostHogEvent } from "@/lib/posthog-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import { diagnoseRejectionForJob, type RejectionDiagnosisResult } from "@/lib/rejectionIntelligence";
import { researchStrategicMoat, type StrategicMoatBriefing } from "@/agent/research";
import { synthesizeLeverageForJob, type LeverageSynthesisResult } from "@/lib/leverageSynthesizer";
import { predictTrapDoorQuestions, type TrapDoorPredictionResult } from "@/lib/trapDoorPredictor";
import { synthesizeInterrogationPlan, type InterrogationPlanResult } from "@/lib/interrogationPlan";
import { computeReappearanceCounts, getReappearanceSignal } from "@/lib/churnSignal";
import { listInterviewPanel } from "@/actions/interviewPanel";
import { logApplicationEvent, type ApplicationEventType } from "@/actions/careerEvents";
import { normalizeRoleFamily } from "@/lib/interviewQuestions";
import type { OfferDetails } from "@/lib/equityDecoder";
import type { TaxEstimateInputs } from "@/lib/taxCalculator";
import type { ApplicationStatus } from "@/lib/applicationStatus";
import type { EvaluationDimensionResult } from "@/lib/evaluator";
import type { CompanyResearchDossier, Profile } from "@/types";

type ActionResult = { success: boolean; error?: string };

// Mirrors app/api/agent/research/route.ts's ResearchProfileRow — the exact
// profile shape researchCompany needs, reused here since
// getTrapDoorPredictions auto-chains the same company-research call.
type ResearchProfileRow = Pick<
  Profile,
  | "id"
  | "email"
  | "current_title"
  | "experience_level"
  | "years_experience"
  | "skills"
  | "work_experience"
  | "education"
  | "preferred_model"
>;

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
    const result = await createExternalJob(insforge, user.id, input);

    if (!result.success) {
      return result;
    }

    revalidatePath("/jobs/external");
    return result;
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

// Kanban card research (agy, 2026-08-17) — same toggle shape as
// toggleSaveJob/toggleHideJob, just a different boolean.
export async function toggleJobPriority(jobId: string, priority: boolean): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ is_priority: priority })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] toggleJobPriority", error);
      return { success: false, error: "Failed to update priority" };
    }

    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] toggleJobPriority", error);
    return { success: false, error: "Failed to update priority" };
  }
}

// Plain user-authored tracker metadata — no AI, mirrors accomplishments.tags's
// shape. Kept as two separate actions (not one combined "update job meta")
// since the tag editor and notes field are two independent, separately-saved
// UI controls on the job detail page.
export async function updateJobTags(jobId: string, tags: string[]): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ tags })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] updateJobTags", error);
      return { success: false, error: "Failed to update tags" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] updateJobTags", error);
    return { success: false, error: "Failed to update tags" };
  }
}

export async function updateJobNotes(jobId: string, notes: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ personal_notes: notes || null })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] updateJobNotes", error);
      return { success: false, error: "Failed to save your note" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] updateJobNotes", error);
    return { success: false, error: "Failed to save your note" };
  }
}

// "Why I Left" private log (build-plan.md §E) — two structured reflection
// fields, distinct from the generic personal_notes field above and from
// the outcome note application_events already captures. v1 scope is
// capture only: no cross-job "surface this when evaluating a similar
// role" retrieval yet, deliberately deferred.
export async function updateJobReflection(jobId: string, loved: string, avoid: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ reflection_loved: loved || null, reflection_avoid: avoid || null })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] updateJobReflection", error);
      return { success: false, error: "Failed to save your reflection" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] updateJobReflection", error);
    return { success: false, error: "Failed to save your reflection" };
  }
}

// Deadline tracker / application calendar (build-plan.md §D) — one real,
// user-entered future timestamp per job (interview date, application
// deadline, follow-up), not derived from interview_events (that's a log of
// what already happened, not a schedule of what's coming). deadlineAt=null
// clears it — same "set or clear via one action" shape as updateJobNotes.
export async function setJobDeadline(
  jobId: string,
  deadlineAt: string | null,
  label: string | null,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ next_deadline_at: deadlineAt, next_deadline_label: deadlineAt ? label || null : null })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] setJobDeadline", error);
      return { success: false, error: "Failed to save the deadline" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/missions");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] setJobDeadline", error);
    return { success: false, error: "Failed to save the deadline" };
  }
}

// Reversible status transition — the Kanban board's drag-and-drop and every
// other status-change surface (JobActionBar, JobResultCard) route through
// this one action, following toggleSaveJob's optimistic-then-write shape
// rather than the old markApplied's one-way write. `from` comes from the
// caller's already-known client state (same idiom JobActionBar already uses
// for its optimistic local state) rather than an extra fetch-before-write —
// it's only used for the PostHog event, not for any server-side validation.
// §Q1 — statuses that correspond to a real application_events entry. "draft"
// has no matching event_type (going back to draft is a correction, not an
// outcome), so it's the one stage transition that never logs an event.
const APPLICATION_EVENT_TYPE_BY_STATUS: Partial<Record<ApplicationStatus, ApplicationEventType>> = {
  applied: "applied",
  interviewing: "interview_scheduled",
  offered: "offer_received",
  rejected: "rejected",
};

export async function setApplicationStatus(
  jobId: string,
  from: ApplicationStatus,
  to: ApplicationStatus,
  note?: string,
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

    // Best-effort — a failed event-log insert shouldn't roll back or fail an
    // otherwise-successful status change. jobs.application_status stays the
    // source of truth the Kanban board reads; this is the durable history
    // record application_events exists to capture (build-plan.md §Q1).
    const eventType = APPLICATION_EVENT_TYPE_BY_STATUS[to];
    if (eventType) {
      const eventResult = await logApplicationEvent(jobId, eventType, note);
      if (!eventResult.success) {
        console.error("[actions/jobs] setApplicationStatus: event log failed", eventResult.error);
      }
    }

    await trackPostHogEvent({
      event: "application_status_changed",
      properties: { userId: user.id, jobId, from, to },
    });

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/missions");
    revalidatePath("/career");
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
      .select("title,matched_skills,missing_skills")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ title: string | null; matched_skills: string[] | null; missing_skills: string[] | null }>();

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

    // §Q2 correction memory — logged alongside the in-place mutation above,
    // not instead of it. Best-effort: a failed insert here shouldn't fail an
    // otherwise-successful correction the user just made.
    const { error: correctionError } = await insforge.database.from("skill_corrections").insert([
      {
        user_id: user.id,
        job_id: jobId,
        role_family: normalizeRoleFamily(job.title ?? ""),
        skill,
        correction_type: moveTo === "matched" ? "confirmed_have" : "confirmed_missing",
      },
    ]);
    if (correctionError) {
      console.error("[actions/jobs] correctSkillTag: skill_corrections insert failed", correctionError);
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

// Trap Door Predictor — tough/uncomfortable questions grounded only in this
// job's own already-stored research (company_research, strategic_moat,
// title_scope_mismatch). No new external fetch, unlike getStrategicMoatBriefing
// above — everything it reads is already sitting on this row.
export async function getTrapDoorPredictions(
  jobId: string,
): Promise<ActionResult & { predictions?: TrapDoorPredictionResult }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "trap_door_prediction");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: job } = await insforge.database
      .from("jobs")
      .select(
        "id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills,company_research,strategic_moat,title_scope_mismatch",
      )
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
        company_research: CompanyResearchDossier | null;
        strategic_moat: { strategicPriorities: string[]; existentialThreats: string[] } | null;
        title_scope_mismatch: { flagged: boolean; note: string } | null;
      }>();

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    // Trap doors are only as good as the company research they're grounded
    // in — per explicit user direction (2026-08-14), don't block on a
    // missing prerequisite the user didn't know they needed. Auto-chain the
    // same free-primary-path generation CompanyResearchAutoLoader already
    // runs unprompted on every job's Company tab (Jina Reader first, real-$
    // Perplexity only as a rare fallback) — this isn't a new cost category,
    // just running it here instead of forcing a trip to another tab first.
    let companyResearch = job.company_research;
    if (!companyResearch) {
      const { data: profile } = await insforge.database
        .from("profiles")
        .select(
          "id,email,current_title,experience_level,years_experience,skills,work_experience,education,preferred_model",
        )
        .eq("id", user.id)
        .maybeSingle<ResearchProfileRow>();

      if (!profile) {
        return { success: false, error: "Profile not found" };
      }

      const researchUsage = await checkAndConsumeUsage(insforge, user.id, user.email, "company_research");
      if (!researchUsage.allowed) {
        return { success: false, error: researchUsage.error };
      }

      const researchResult = await researchCompany({
        job: {
          id: job.id,
          title: job.title,
          company: job.company,
          source_url: job.source_url,
          external_apply_url: job.external_apply_url,
          about_role: job.about_role,
          matched_skills: job.matched_skills ?? [],
          missing_skills: job.missing_skills ?? [],
        },
        profile,
        provider: resolveProvider(profile.preferred_model, profile.email),
      });

      if (!researchResult.success) {
        return { success: false, error: "Company research failed — try again." };
      }

      companyResearch = researchResult.dossier;

      const { error: researchUpdateError } = await insforge.database
        .from("jobs")
        .update({ company_research: companyResearch })
        .eq("id", jobId)
        .eq("user_id", user.id);

      if (researchUpdateError) {
        console.error("[actions/jobs] getTrapDoorPredictions company_research persist", researchUpdateError);
      }
    }

    const predictions = await predictTrapDoorQuestions({
      id: job.id,
      title: job.title,
      company: job.company,
      companyResearch,
      strategicMoat: job.strategic_moat,
      titleScopeMismatch: job.title_scope_mismatch,
    });

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({ trap_door_predictions: predictions, trap_door_predicted_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] getTrapDoorPredictions persist", updateError);
      return { success: false, error: "Predictions generated but failed to save" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true, predictions };
  } catch (error) {
    console.error("[actions/jobs] getTrapDoorPredictions", error);
    return { success: false, error: "Failed to generate predictions" };
  }
}

// The Interrogation Plan — synthesizes questions to ASK the interviewers,
// purely from data two already-shipped features already generated
// (strategic_moat.smartQuestions + each panel member's researched_background).
// No new external research of its own.
export async function getInterrogationPlan(
  jobId: string,
): Promise<ActionResult & { plan?: InterrogationPlanResult }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "interrogation_plan");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: job } = await insforge.database
      .from("jobs")
      .select(
        "id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills,strategic_moat",
      )
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
        strategic_moat: { strategicPriorities: string[]; existentialThreats: string[]; smartQuestions: string[] } | null;
      }>();

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const panelResult = await listInterviewPanel(jobId);
    const panelMembers = (panelResult.data ?? []).filter((m) => m.researched_background);

    // Same auto-chain reasoning as getTrapDoorPredictions above: strategic
    // moat's primary path is the same free Jina-first flow as company
    // research, so don't block the user on a manual trip to the Company tab
    // first — only a genuine Perplexity fallback ever costs real $, and
    // that's already an accepted cost profile everywhere else this runs.
    // A missing panelist is NOT auto-chained (see InterviewPanel.tsx —
    // names come from the candidate, nothing here can invent one), but the
    // plan is still useful with strategic_moat alone.
    let strategicMoat = job.strategic_moat;
    if (!strategicMoat) {
      const moatUsage = await checkAndConsumeUsage(insforge, user.id, user.email, "strategic_moat");
      if (!moatUsage.allowed) {
        return { success: false, error: moatUsage.error };
      }

      const moatResult = await researchStrategicMoat({
        id: job.id,
        title: job.title,
        company: job.company,
        source_url: job.source_url,
        external_apply_url: job.external_apply_url,
        about_role: job.about_role,
        matched_skills: job.matched_skills ?? [],
        missing_skills: job.missing_skills ?? [],
      });

      if (!moatResult.success) {
        return { success: false, error: moatResult.error };
      }

      strategicMoat = moatResult.briefing;

      const { error: moatUpdateError } = await insforge.database
        .from("jobs")
        .update({ strategic_moat: strategicMoat, strategic_moat_researched_at: new Date().toISOString() })
        .eq("id", jobId)
        .eq("user_id", user.id);

      if (moatUpdateError) {
        console.error("[actions/jobs] getInterrogationPlan strategic_moat persist", moatUpdateError);
      }
    }

    const plan = await synthesizeInterrogationPlan({
      strategicMoat,
      panelMembers: panelMembers.map((m) => ({
        name: m.name,
        background: m.researched_background!,
      })),
    });

    const { error: updateError } = await insforge.database
      .from("jobs")
      .update({ interrogation_plan: plan, interrogation_plan_generated_at: new Date().toISOString() })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/jobs] getInterrogationPlan persist", updateError);
      return { success: false, error: "Plan generated but failed to save" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true, plan };
  } catch (error) {
    console.error("[actions/jobs] getInterrogationPlan", error);
    return { success: false, error: "Failed to generate an interrogation plan" };
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
