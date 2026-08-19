"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import { askJobChat, type ChatMessage, type JobChatContext, type JobChatResult } from "@/lib/jobChat";
import type { Job, Profile } from "@/types";

type JobChatActionResult = { success: true; result: JobChatResult } | { success: false; error: string };

type JobChatRow = Pick<
  Job,
  "title" | "company" | "about_role" | "matched_skills" | "missing_skills" | "overall_grade" | "evaluation" | "title_scope_mismatch"
>;

// Opt-in, per-message (not eager) — the whole conversation history is
// re-sent each turn (same shape as useDocumentChat's send()), and the job
// context is always re-fetched server-side rather than trusted from the
// client, same "never trust client-sent state" rule as
// app/api/documents/chat/route.ts.
export async function askJobChatAction(jobId: string, messages: ChatMessage[]): Promise<JobChatActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "job_chat");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const [{ data: job }, { data: profile }] = await Promise.all([
      insforge.database
        .from("jobs")
        .select("title,company,about_role,matched_skills,missing_skills,overall_grade,evaluation,title_scope_mismatch")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle<JobChatRow>(),
      insforge.database.from("profiles").select("preferred_model").eq("id", user.id).maybeSingle<Pick<Profile, "preferred_model">>(),
    ]);

    if (!job) {
      return { success: false, error: "Job not found." };
    }

    const context: JobChatContext = {
      title: job.title ?? "this role",
      company: job.company ?? "this company",
      aboutRole: job.about_role,
      matchedSkills: job.matched_skills ?? [],
      missingSkills: job.missing_skills ?? [],
      overallGrade: job.overall_grade,
      evaluation: job.evaluation,
      titleScopeMismatch: job.title_scope_mismatch,
    };

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const result = await askJobChat(context, messages, provider);

    return { success: true, result };
  } catch (error) {
    console.error("[actions/jobChat] askJobChatAction", error);
    return { success: false, error: "Failed to get a response. Please try again." };
  }
}
