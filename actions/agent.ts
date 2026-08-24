"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkAndConsumeUsage } from "@/lib/usage";
import { resolveProvider } from "@/lib/access";
import { addAccomplishment } from "@/actions/accomplishments";
import {
  getAgentReply,
  type AgentAction,
  type AgentChatMessage,
  type AgentFocusedJob,
  type AgentSnapshot,
  type AgentTrackerJob,
} from "@/lib/agentAssistant";
import type { EvaluationDimensionResult } from "@/lib/evaluator";
import type { Profile } from "@/types";

type AgentMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  action_payload: AgentAction | null;
  action_executed_at: string | null;
  created_at: string;
};

type ActionResult = { success: boolean; error?: string };

export async function listAgentMessages(): Promise<{ data: AgentMessageRow[] }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("agent_messages")
    .select("id,role,content,action_payload,action_executed_at,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(200);

  return { data: (data ?? []) as AgentMessageRow[] };
}

function buildProfileSummary(profile: Pick<Profile, "current_title" | "experience_level" | "years_experience" | "skills"> | null): string {
  if (!profile) return "No profile on file yet.";

  const parts = [
    profile.current_title ?? "Unknown title",
    profile.experience_level ? `${profile.experience_level} level` : null,
    profile.years_experience != null ? `${profile.years_experience} years experience` : null,
  ].filter(Boolean);

  const skillsText = profile.skills.length > 0 ? `Skills: ${profile.skills.join(", ")}.` : "No skills listed yet.";

  return `${parts.join(", ")}. ${skillsText}`;
}

// Navigator (build-plan.md §O) — real data assembled server-side (never
// trusts client-supplied job/profile data), one grounded call via
// lib/agentAssistant.ts, structured output. Only a returned "action" gets
// executed, and only once the user explicitly confirms it via
// confirmAgentAction below — this function never mutates anything beyond
// persisting the conversation itself.
export async function sendAgentMessage(
  content: string,
  contextJobId?: string,
): Promise<ActionResult & { messages?: AgentMessageRow[] }> {
  const user = await requireUser();
  const trimmed = content.trim();

  if (!trimmed) {
    return { success: false, error: "Enter a message." };
  }

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "agent_message");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { error: insertUserError } = await insforge.database
      .from("agent_messages")
      .insert([{ user_id: user.id, role: "user", content: trimmed }]);

    if (insertUserError) {
      console.error("[actions/agent] sendAgentMessage insert user message", insertUserError);
      return { success: false, error: "Failed to send message" };
    }

    const [{ data: history }, { data: profile }, { data: trackerJobs }, focusedJobResult] = await Promise.all([
      insforge.database
        .from("agent_messages")
        .select("role,content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(20),
      insforge.database
        .from("profiles")
        .select("current_title,experience_level,years_experience,skills,preferred_model")
        .eq("id", user.id)
        .maybeSingle<
          Pick<Profile, "current_title" | "experience_level" | "years_experience" | "skills" | "preferred_model">
        >(),
      insforge.database
        .from("jobs")
        .select("title,company,application_status,application_status_updated_at")
        .eq("user_id", user.id)
        .in("application_status", ["applied", "interviewing"])
        .order("application_status_updated_at", { ascending: true })
        .limit(20),
      contextJobId
        ? insforge.database
            .from("jobs")
            .select("title,company,match_score,overall_grade,evaluation,missing_skills")
            .eq("id", contextJobId)
            .eq("user_id", user.id)
            .maybeSingle<{
              title: string | null;
              company: string | null;
              match_score: number | null;
              overall_grade: string | null;
              evaluation: EvaluationDimensionResult[] | null;
              missing_skills: string[] | null;
            }>()
        : Promise.resolve({ data: null }),
    ]);

    const snapshot: AgentSnapshot = {
      profileSummary: buildProfileSummary(profile ?? null),
      trackerJobs: (trackerJobs ?? []) as AgentTrackerJob[],
      focusedJob: (focusedJobResult.data as AgentFocusedJob | null) ?? null,
    };

    const conversationHistory = (history ?? []) as AgentChatMessage[];

    const reply = await getAgentReply(
      snapshot,
      conversationHistory,
      resolveProvider(profile?.preferred_model, user.email),
    );

    const { error: insertAssistantError } = await insforge.database.from("agent_messages").insert([
      {
        user_id: user.id,
        role: "assistant",
        content: reply.reply,
        action_payload: reply.action,
      },
    ]);

    if (insertAssistantError) {
      console.error("[actions/agent] sendAgentMessage insert assistant message", insertAssistantError);
      return { success: false, error: "Failed to save reply" };
    }

    const { data: messages } = await insforge.database
      .from("agent_messages")
      .select("id,role,content,action_payload,action_executed_at,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return { success: true, messages: (messages ?? []) as AgentMessageRow[] };
  } catch (error) {
    console.error("[actions/agent] sendAgentMessage", error);
    return { success: false, error: "Failed to send message" };
  }
}

// Executes a previously-proposed action — the only place Navigator's replies
// ever actually change data, and only ever on an explicit user click.
export async function confirmAgentAction(messageId: string): Promise<ActionResult> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: message } = await insforge.database
      .from("agent_messages")
      .select("id,action_payload,action_executed_at")
      .eq("id", messageId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; action_payload: AgentAction | null; action_executed_at: string | null }>();

    if (!message || !message.action_payload) {
      return { success: false, error: "No action to confirm" };
    }

    if (message.action_executed_at) {
      return { success: true };
    }

    const action = message.action_payload;

    if (action.type === "log_accomplishment") {
      const result = await addAccomplishment({
        title: action.title,
        description: action.description,
        date: action.date,
        tags: action.tags,
      });

      if (!result.success) {
        return { success: false, error: result.error ?? "Failed to log accomplishment" };
      }
    }

    const { error: updateError } = await insforge.database
      .from("agent_messages")
      .update({ action_executed_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("user_id", user.id);

    if (updateError) {
      console.error("[actions/agent] confirmAgentAction persist", updateError);
    }

    revalidatePath("/career");
    return { success: true };
  } catch (error) {
    console.error("[actions/agent] confirmAgentAction", error);
    return { success: false, error: "Failed to confirm action" };
  }
}
