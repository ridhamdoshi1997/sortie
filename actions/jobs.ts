"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { inngest } from "@/lib/inngest/client";
import { fetchViaJinaReader } from "@/agent/research";

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

export async function markApplied(jobId: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("jobs")
      .update({ application_status: "applied" })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/jobs] markApplied", error);
      return { success: false, error: "Failed to mark as applied" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    revalidatePath("/jobs/applied");
    return { success: true };
  } catch (error) {
    console.error("[actions/jobs] markApplied", error);
    return { success: false, error: "Failed to mark as applied" };
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
