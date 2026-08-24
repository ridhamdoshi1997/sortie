import { NextRequest, NextResponse } from "next/server";

import { getResendClient, TICKET_REPLY_PATTERN } from "@/lib/email/resend";
import { createAdminDbClient } from "@/lib/admin/client";

// Resend inbound-email webhook — an email to support@{domain} (or a reply
// to support+{ticketId}@{domain}) becomes/appends to a real support ticket.
// INERT until a domain is verified in Resend and this route is registered
// as its email.received webhook target — see lib/email/resend.ts's own
// comment for the exact activation steps.
//
// Runs unauthenticated (any real user session) — trust comes entirely
// from the Svix signature check below, not from lib/admin/auth.ts's
// requireAdmin()/requireUser(). All DB writes go through the service-role
// client for the same reason (there's no user session to run RLS as).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[resend-inbound] RESEND_WEBHOOK_SECRET not configured — ignoring inbound webhook call");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 501 });
  }

  const rawBody = await request.text();
  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ ok: false, error: "Missing signature headers" }, { status: 400 });
  }

  const resend = getResendClient();
  let event;
  try {
    event = resend.webhooks.verify({
      payload: rawBody,
      headers: { id: svixId, timestamp: svixTimestamp, signature: svixSignature },
      webhookSecret,
    });
  } catch (error) {
    console.error("[resend-inbound] signature verification failed", error);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.received") {
    // Ack and ignore every other event type — this endpoint is registered
    // only for email.received, but ack anyway rather than 4xx-ing Resend
    // into a retry loop if the webhook is ever configured for more events.
    return NextResponse.json({ ok: true, skipped: event.type });
  }

  const { email_id: emailId, from, to, subject } = event.data;

  const admin = createAdminDbClient();

  const { data: profile } = await admin.database
    .from("profiles")
    .select("id")
    .eq("email", extractEmailAddress(from))
    .maybeSingle<{ id: string }>();

  if (!profile) {
    // Honest partial v1 (matches this app's own convention elsewhere):
    // support_tickets.user_id is a real FK to auth.users, so an email from
    // an address with no matching Sortie account can't be attached to
    // anyone. Logged for visibility, acked so Resend doesn't retry.
    console.error(`[resend-inbound] no Sortie account found for sender ${from} — dropping inbound email`);
    return NextResponse.json({ ok: true, skipped: "unknown_sender" });
  }

  const { data: fullEmail } = await resend.emails.receiving.get(emailId);
  const body = fullEmail?.text?.trim() || "(no message body)";

  const ticketAddress = to.find((addr) => TICKET_REPLY_PATTERN.test(addr));
  const ticketIdMatch = ticketAddress?.match(TICKET_REPLY_PATTERN);
  const ticketId = ticketIdMatch?.[1];

  if (ticketId) {
    const { data: ticket } = await admin.database.from("support_tickets").select("id,user_id").eq("id", ticketId).maybeSingle<{ id: string; user_id: string }>();

    if (!ticket || ticket.user_id !== profile.id) {
      console.error(`[resend-inbound] ticket ${ticketId} not found or sender ${from} doesn't own it — dropping`);
      return NextResponse.json({ ok: true, skipped: "ticket_mismatch" });
    }

    await admin.database.from("support_ticket_messages").insert([{ ticket_id: ticketId, user_id: profile.id, author_type: "user", body }]);
    await admin.database.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticketId);

    return NextResponse.json({ ok: true, ticketId });
  }

  // No ticket-scoped reply address matched -> a fresh email to the plain
  // support@{domain} address, opens a new ticket.
  const { data: newTicket, error: ticketError } = await admin.database
    .from("support_tickets")
    .insert([{ user_id: profile.id, subject: subject || "(no subject)", status: "open" }])
    .select("id")
    .single<{ id: string }>();

  if (ticketError || !newTicket) {
    console.error("[resend-inbound] failed to create ticket from inbound email", ticketError);
    return NextResponse.json({ ok: false, error: "Failed to create ticket" }, { status: 500 });
  }

  await admin.database.from("support_ticket_messages").insert([{ ticket_id: newTicket.id, user_id: profile.id, author_type: "user", body }]);

  return NextResponse.json({ ok: true, ticketId: newTicket.id });
}

function extractEmailAddress(fromHeader: string): string {
  // Resend's `from` may be a bare address or "Name <address@domain>" —
  // normalize to the bare address for the profiles.email lookup.
  const match = fromHeader.match(/<([^>]+)>/);
  return (match ? match[1] : fromHeader).trim().toLowerCase();
}
