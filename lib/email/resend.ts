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
