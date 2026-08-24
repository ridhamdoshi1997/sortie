"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkAndConsumeUsage } from "@/lib/usage";
import { researchInterviewerBackground, type InterviewerBackground } from "@/agent/research";

type ActionResult = { success: boolean; error?: string };

export type InterviewPanelMemberRow = {
  id: string;
  job_id: string;
  name: string;
  title: string | null;
  researched_background: InterviewerBackground | null;
  researched_at: string | null;
  created_at: string;
};

const PANEL_MEMBER_COLUMNS = "id,job_id,name,title,researched_background,researched_at,created_at";

export async function listInterviewPanel(jobId: string): Promise<{
  success: boolean;
  data?: InterviewPanelMemberRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("interview_panel_members")
      .select(PANEL_MEMBER_COLUMNS)
      .eq("job_id", jobId)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[actions/interviewPanel] listInterviewPanel", error);
      return { success: false, error: "Failed to load the interview panel" };
    }

    return { success: true, data: (data ?? []) as InterviewPanelMemberRow[] };
  } catch (error) {
    console.error("[actions/interviewPanel] listInterviewPanel", error);
    return { success: false, error: "Failed to load the interview panel" };
  }
}

export async function addInterviewPanelMember(
  jobId: string,
  name: string,
  title: string,
): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database.from("interview_panel_members").insert([
      { job_id: jobId, user_id: user.id, name, title: title || null },
    ]);

    if (error) {
      console.error("[actions/interviewPanel] addInterviewPanelMember", error);
      return { success: false, error: "Failed to add this panelist" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/interviewPanel] addInterviewPanelMember", error);
    return { success: false, error: "Failed to add this panelist" };
  }
}

export async function removeInterviewPanelMember(id: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { error } = await insforge.database
      .from("interview_panel_members")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/interviewPanel] removeInterviewPanelMember", error);
      return { success: false, error: "Failed to remove this panelist" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/interviewPanel] removeInterviewPanelMember", error);
    return { success: false, error: "Failed to remove this panelist" };
  }
}

// Gated by checkAndConsumeUsage — the same free-first-then-Perplexity cost
// profile as getStrategicMoatBriefing, opt-in per panelist.
export async function researchPanelMember(
  memberId: string,
  company: string,
): Promise<ActionResult & { background?: InterviewerBackground }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "interviewer_research");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: member } = await insforge.database
      .from("interview_panel_members")
      .select("id,name")
      .eq("id", memberId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; name: string }>();

    if (!member) {
      return { success: false, error: "Panelist not found" };
    }

    const result = await researchInterviewerBackground(member.name, company);
    if (!result.success) {
      return { success: false, error: result.error };
    }

    const { error: updateError } = await insforge.database
      .from("interview_panel_members")
      .update({ researched_background: result.background, researched_at: new Date().toISOString() })
      .eq("id", memberId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/interviewPanel] researchPanelMember persist", updateError);
      return { success: false, error: "Research generated but failed to save" };
    }

    revalidatePath("/find-jobs/[id]", "page");
    return { success: true, background: result.background };
  } catch (error) {
    console.error("[actions/interviewPanel] researchPanelMember", error);
    return { success: false, error: "Failed to research this panelist" };
  }
}
