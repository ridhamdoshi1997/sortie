"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { toUserMessage } from "@/lib/errors";

// User-facing push subscription management. Plain CRUD through the
// regular cookie-authenticated client — RLS (migration
// 20260819110000_push-subscriptions-table.sql) does the real enforcement,
// same convention as actions/support.ts.
type ActionResult = { success: true } | { success: false; error: string };

export async function subscribeToPush(endpoint: string, p256dh: string, auth: string): Promise<ActionResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { error } = await insforge.database
    .from("push_subscriptions")
    .upsert([{ user_id: user.id, endpoint, p256dh, auth }], { onConflict: "endpoint" });

  if (error) return { success: false, error: toUserMessage(error, "Failed to enable push notifications.") };
  return { success: true };
}

export async function unsubscribeFromPush(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { error } = await insforge.database.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
  if (error) return { success: false, error: toUserMessage(error, "Failed to disable push notifications.") };
  return { success: true };
}

export async function getMyPushSubscriptions(): Promise<string[]> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database.from("push_subscriptions").select("endpoint").eq("user_id", user.id);
  return ((data ?? []) as { endpoint: string }[]).map((r) => r.endpoint);
}
