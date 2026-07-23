"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";

type ActionResult = { success: boolean; error?: string };

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
