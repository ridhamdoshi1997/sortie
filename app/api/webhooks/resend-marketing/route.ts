import { NextRequest, NextResponse } from "next/server";

import { getResendClient } from "@/lib/email/resend";
import { createAdminDbClient } from "@/lib/admin/client";

// Open/click analytics for marketing broadcasts — reads Resend's own
// email.opened/email.clicked webhook events, matches each one back to a
// broadcast via the broadcast_id tag sendMarketingEmail() attaches on
// send (lib/email/resend.ts). Same inert-until-domain constraint as every
// other email feature this session: counts stay genuinely 0 until a real
// domain is verified and this route is registered as the webhook target
// for both events.
export async function POST(request: NextRequest): Promise<NextResponse> {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[resend-marketing] RESEND_WEBHOOK_SECRET not configured — ignoring webhook call");
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
    console.error("[resend-marketing] signature verification failed", error);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  if (event.type !== "email.opened" && event.type !== "email.clicked") {
    return NextResponse.json({ ok: true, skipped: event.type });
  }

  const broadcastId = event.data.tags?.broadcast_id;
  if (!broadcastId) {
    // A real Resend email this app sent for another reason (auth, support
    // reply) — not every send carries this tag, and that's expected.
    return NextResponse.json({ ok: true, skipped: "no_broadcast_tag" });
  }

  const admin = createAdminDbClient();
  const column = event.type === "email.opened" ? "opened_count" : "clicked_count";

  const { data: broadcast } = await admin.database.from("marketing_broadcasts").select(column).eq("id", broadcastId).maybeSingle<Record<string, number>>();
  if (!broadcast) {
    return NextResponse.json({ ok: true, skipped: "broadcast_not_found" });
  }

  await admin.database
    .from("marketing_broadcasts")
    .update({ [column]: (broadcast[column] ?? 0) + 1 })
    .eq("id", broadcastId);

  return NextResponse.json({ ok: true, broadcastId, event: event.type });
}
