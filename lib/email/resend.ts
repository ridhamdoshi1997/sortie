import { Resend } from "resend";

// Real support-email round trip (Phase 17, direct user request, follow-up
// to the Support ticket feature) — outbound admin replies as real emails,
// inbound emails to support@{domain} become/append to real tickets. Built
// now, INERT until the user owns and verifies a domain in Resend:
// - SUPPORT_FROM_EMAIL unset -> outbound falls back to Resend's sandbox
//   sender (onboarding@resend.dev), which Resend only reliably delivers to
//   the account owner's own verified email pre-domain-verification, not to
//   arbitrary real users. Confirmed via Resend's own docs, not guessed.
// - RESEND_WEBHOOK_SECRET / SUPPORT_INBOUND_DOMAIN unset -> the inbound
//   webhook route (app/api/webhooks/resend-inbound/route.ts) still exists
//   but Resend has nothing to call it — there's no inbound routing until a
//   domain is verified and MX records point at Resend.
// Activation steps once a domain exists, no code changes needed: verify
// the domain in Resend, enable "Receiving" on it, create a webhook for
// the email.received event pointed at /api/webhooks/resend-inbound, then
// set SUPPORT_FROM_EMAIL / SUPPORT_INBOUND_DOMAIN / RESEND_WEBHOOK_SECRET.

let client: Resend | null = null;

export function getResendClient(): Resend {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

// Reply-To encodes the ticket id (support+{ticketId}@{domain}) so a plain
// "Reply" in the user's own email client threads straight back into this
// ticket — read back out by the inbound webhook via TICKET_REPLY_PATTERN.
export function buildTicketReplyToAddress(ticketId: string): string | null {
  const domain = process.env.SUPPORT_INBOUND_DOMAIN;
  if (!domain) return null;
  return `support+${ticketId}@${domain}`;
}

export const TICKET_REPLY_PATTERN = /^support\+([0-9a-f-]{36})@/i;

// Fire-and-forget, same resilience pattern as every other best-effort
// side-effect in this app (e.g. addExternalJob's inngest.send() fix) — a
// support reply must always save to the DB regardless of whether the
// email actually sends.
export async function sendSupportReplyEmail(params: { to: string; subject: string; body: string; ticketId: string }): Promise<void> {
  const fromEmail = process.env.SUPPORT_FROM_EMAIL || "onboarding@resend.dev";
  const replyTo = buildTicketReplyToAddress(params.ticketId);

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: `Sortie Support <${fromEmail}>`,
      to: params.to,
      subject: `Re: ${params.subject}`,
      text: params.body,
      ...(replyTo ? { replyTo } : {}),
    });
    if (error) {
      console.error("[lib/email/resend] sendSupportReplyEmail", error);
    }
  } catch (error) {
    console.error("[lib/email/resend] sendSupportReplyEmail", error);
  }
}

// Marketing broadcasts (same session, same inert-until-domain constraint
// as support email — see this file's own top comment). CAN-SPAM's real
// requirements, not just a cosmetic footer: MARKETING_PHYSICAL_ADDRESS
// must be set (checked by the caller, actions/adminMarketing.ts's
// sendBroadcast(), which refuses to send at all without it — a compliance
// gate, not a UI nicety) and every send carries a real per-recipient
// unsubscribe link built from their own profiles.unsubscribe_token.
// NEXT_PUBLIC_APP_URL isn't set anywhere in this project yet — falls back
// to Vercel's own auto-provided VERCEL_URL (hostname only, no protocol) in
// a real deployment, then bare localhost for pure local dev. Set
// NEXT_PUBLIC_APP_URL explicitly once a real domain exists so this stops
// depending on Vercel's preview-deployment hostname.
export function buildUnsubscribeUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3001");
  return `${base}/api/unsubscribe?token=${token}`;
}

// Tagged with the broadcast id (Resend's own tags feature) so the
// email.opened/email.clicked webhook (app/api/webhooks/resend-marketing/
// route.ts) knows which broadcast to credit — Resend echoes tags back
// verbatim in every event payload for that send. Same inert-until-domain
// constraint as the rest of this file: opened/clicked counts stay
// genuinely 0 until real sends actually go out.
export async function sendMarketingEmail(params: {
  to: string;
  subject: string;
  body: string;
  unsubscribeToken: string;
  physicalAddress: string;
  broadcastId: string;
}): Promise<{ success: boolean }> {
  const fromEmail = process.env.MARKETING_FROM_EMAIL || process.env.SUPPORT_FROM_EMAIL || "onboarding@resend.dev";
  const unsubscribeUrl = buildUnsubscribeUrl(params.unsubscribeToken);

  const text = `${params.body}\n\n---\n${params.physicalAddress}\nUnsubscribe: ${unsubscribeUrl}`;

  try {
    const resend = getResendClient();
    const { error } = await resend.emails.send({
      from: `Sortie <${fromEmail}>`,
      to: params.to,
      subject: params.subject,
      text,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
      tags: [{ name: "broadcast_id", value: params.broadcastId }],
    });
    if (error) {
      console.error("[lib/email/resend] sendMarketingEmail", error);
      return { success: false };
    }
    return { success: true };
  } catch (error) {
    console.error("[lib/email/resend] sendMarketingEmail", error);
    return { success: false };
  }
}
