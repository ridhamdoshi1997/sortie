import webpush from "web-push";
import { z } from "zod";

import { complete, getModel } from "@/lib/models";

// Push notifications (admin console expansion item 6, context/RESUME.md) —
// the second Marketing broadcast channel, paired with email per the
// original plan. Unlike email, genuinely usable today: Web Push + VAPID
// needs no external account, no domain verification — just the generated
// keypair in .env. VAPID "subject" is a contact URL/mailto the push
// services use if they need to reach the sender; this app's own domain
// isn't live yet, so a mailto is used instead of guessing a URL.
let configured = false;

function ensureConfigured(): void {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys not configured — set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.");
  }
  webpush.setVapidDetails("mailto:support@sortie.app", publicKey, privateKey);
  configured = true;
}

export type PushSubscriptionKeys = { endpoint: string; p256dh: string; auth: string };

export type PushSendResult = { success: true } | { success: false; expired: boolean; error: string };

// expired=true means the browser's push service returned 404/410 — the
// subscription is dead and the caller should delete it, not retry it.
export async function sendPushNotification(
  subscription: PushSubscriptionKeys,
  payload: { title: string; body: string; url?: string },
): Promise<PushSendResult> {
  ensureConfigured();

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload),
    );
    return { success: true };
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    const expired = status === 404 || status === 410;
    return { success: false, expired, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

const PUSH_DRAFT_SYSTEM_PROMPT = `You are drafting a first-pass browser push notification for Sortie, a job-search copilot product. Push notifications are read at a glance — the title must be under 50 characters and the body under 120 characters, both plain text, no emoji, no markdown, no exclamation-point hype. Honest, direct, no invented features or stats. This is a rough first draft an admin will review and edit before sending, not final copy.

Return ONLY valid JSON matching this exact shape:
{ "title": "string, under 50 characters", "body": "string, under 120 characters" }`;

const pushDraftSchema = z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(200),
});

export type PushDraft = { title: string; body: string };

// AI-assisted first-draft for push notifications (direct user request) —
// same family as the Content/Marketing/Support draft buttons, structured
// output instead of free text since title/body have real length limits a
// push notification actually enforces. Internal admin tooling, not
// usage-metered.
export async function generatePushDraft(brief: string): Promise<PushDraft> {
  const userPrompt = `What this notification should announce or say: ${brief.trim() || "(no brief given — draft something generic and useful)"}`;

  const raw = await complete(getModel("gemini", "smart"), {
    systemPrompt: PUSH_DRAFT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 200,
    jsonResponse: true,
  });

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    console.error("[lib/push] generatePushDraft JSON parse failed", error);
    throw new Error("Failed to generate a valid push draft.");
  }

  const parsed = pushDraftSchema.safeParse(json);
  if (!parsed.success) {
    console.error("[lib/push] generatePushDraft schema validation failed", parsed.error);
    throw new Error("Failed to generate a valid push draft.");
  }
  return parsed.data;
}
