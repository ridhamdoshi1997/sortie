"use server";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { inngest } from "@/lib/inngest/client";
import { generatePushDraft, type PushDraft } from "@/lib/push";
import { toUserMessage } from "@/lib/errors";

type ActionResult = { success: true } | { success: false; error: string };

export async function getPushSubscriberCount(): Promise<number> {
  try {
    await requireAdmin();
    const client = createAdminDbClient();
    const { count } = await client.database.from("push_subscriptions").select("id", { count: "exact", head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Push is send-immediately, no draft/edit cycle like email broadcasts —
// a push notification is inherently ephemeral (title + short body + a
// link), there's no real "draft" state worth persisting.
export async function sendPushBroadcast(title: string, body: string, url: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle) return { success: false, error: "Enter a title." };
    if (!trimmedBody) return { success: false, error: "Enter a message." };

    await logAdminAction(admin, { action: "send_push_broadcast", after: { title: trimmedTitle } });

    await inngest.send({ name: "push/broadcast.send", data: { title: trimmedTitle, body: trimmedBody, url: url.trim() || undefined } });

    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type DraftResult = { success: true; draft: PushDraft } | { success: false; error: string };

export async function generatePushBroadcastDraft(brief: string): Promise<DraftResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);

    const draft = await generatePushDraft(brief);
    return { success: true, draft };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to generate a draft.") };
  }
}
