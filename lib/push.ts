import webpush from "web-push";

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
