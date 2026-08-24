"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { getTopUsersByUsage, getTotalUserCount } from "@/lib/admin/queries";
import { getSupportDashboard } from "@/lib/admin/support";
import { getExpensesSummary } from "@/lib/admin/expenses";
import { listBroadcasts } from "@/lib/admin/marketing";
import { getAdminAgentReply, type AdminAgentChatMessage, type AdminAgentSnapshot } from "@/lib/adminAgentAssistant";

// Admin Navigator — see lib/adminAgentAssistant.ts's own comment for why
// this is a separate system from consumer Navigator, not a duplicate.
// Internal admin tooling: deliberately NOT usage-metered via
// checkAndConsumeUsage, same reasoning as the Content/Marketing AI-draft
// buttons (an occasional owner/admin action, not a consumer feature).
type AdminAgentMessageRow = { id: string; role: "user" | "assistant"; content: string; created_at: string };

export async function listAdminAgentMessages(): Promise<{ success: true; messages: AdminAgentMessageRow[] } | { success: false; error: string }> {
  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    const { data } = await client.database
      .from("admin_agent_messages")
      .select("id,role,content,created_at")
      .eq("admin_user_id", admin.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return { success: true, messages: (data ?? []) as AdminAgentMessageRow[] };
  } catch {
    return { success: false, error: "Not authorized." };
  }
}

type SendResult = { success: true; messages: AdminAgentMessageRow[] } | { success: false; error: string };

export async function sendAdminAgentMessage(content: string): Promise<SendResult> {
  const trimmed = content.trim();
  if (!trimmed) return { success: false, error: "Enter a message." };

  try {
    const admin = await requireAdmin();
    const client = createAdminDbClient();

    const { error: insertUserError } = await client.database.from("admin_agent_messages").insert([{ admin_user_id: admin.id, role: "user", content: trimmed }]);
    if (insertUserError) return { success: false, error: "Failed to send message." };

    const [{ data: history }, support, topUsersByUsage, expenses, recentBroadcasts, totalUserCount] = await Promise.all([
      client.database.from("admin_agent_messages").select("role,content").eq("admin_user_id", admin.id).order("created_at", { ascending: true }).limit(20),
      getSupportDashboard(),
      getTopUsersByUsage(5),
      getExpensesSummary(),
      listBroadcasts(),
      getTotalUserCount(),
    ]);

    const snapshot: AdminAgentSnapshot = { support, topUsersByUsage, expenses, recentBroadcasts, totalUserCount };
    const conversationHistory = (history ?? []) as AdminAgentChatMessage[];

    const reply = await getAdminAgentReply(snapshot, conversationHistory);

    const { error: insertAssistantError } = await client.database.from("admin_agent_messages").insert([{ admin_user_id: admin.id, role: "assistant", content: reply.reply }]);
    if (insertAssistantError) return { success: false, error: "Failed to save reply." };

    const { data: messages } = await client.database
      .from("admin_agent_messages")
      .select("id,role,content,created_at")
      .eq("admin_user_id", admin.id)
      .order("created_at", { ascending: true })
      .limit(200);

    return { success: true, messages: (messages ?? []) as AdminAgentMessageRow[] };
  } catch (error) {
    console.error("[actions/adminAgent] sendAdminAgentMessage", error);
    return { success: false, error: "Failed to send message." };
  }
}
