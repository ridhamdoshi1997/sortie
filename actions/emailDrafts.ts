"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import { generateEmailDraft, type EmailDraft, type EmailDraftType } from "@/lib/emailDrafts";
import type { Profile } from "@/types";

type Result = { success: true; draft: EmailDraft } | { success: false; error: string };

export async function generateEmailDraftAction(jobId: string, type: EmailDraftType): Promise<Result> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "email_draft");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: job } = await insforge.database
      .from("jobs")
      .select("title,company,matched_skills,application_status_updated_at")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ title: string | null; company: string | null; matched_skills: string[] | null; application_status_updated_at: string | null }>();

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("current_title,years_experience,preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "current_title" | "years_experience" | "preferred_model">>();

    let interviewerName: string | null = null;
    if (type === "thank_you") {
      const { data: panel } = await insforge.database
        .from("interview_panel_members")
        .select("name")
        .eq("job_id", jobId)
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ name: string }>();
      interviewerName = panel?.name ?? null;
    }

    const daysSinceApplied = job.application_status_updated_at
      ? Math.round((Date.now() - new Date(job.application_status_updated_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const draft = await generateEmailDraft(
      {
        type,
        jobTitle: job.title,
        company: job.company,
        candidateTitle: profile?.current_title ?? null,
        yearsExperience: profile?.years_experience ?? null,
        matchedSkills: job.matched_skills ?? [],
        interviewerName,
        daysSinceApplied,
      },
      provider,
    );

    return { success: true, draft };
  } catch (error) {
    console.error("[actions/emailDrafts] generateEmailDraftAction", error);
    return { success: false, error: "Failed to generate an email draft" };
  }
}
