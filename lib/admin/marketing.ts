import { createAdminDbClient } from "@/lib/admin/client";

export type BroadcastStatus = "draft" | "sending" | "sent" | "failed";

export type BroadcastRow = {
  id: string;
  subject: string;
  bodyMarkdown: string;
  status: BroadcastStatus;
  recipientCount: number | null;
  sentCount: number;
  sentAt: string | null;
  createdAt: string;
};

type RawBroadcast = {
  id: string;
  subject: string;
  body_markdown: string;
  status: BroadcastStatus;
  recipient_count: number | null;
  sent_count: number;
  sent_at: string | null;
  created_at: string;
};

function mapRow(b: RawBroadcast): BroadcastRow {
  return {
    id: b.id,
    subject: b.subject,
    bodyMarkdown: b.body_markdown,
    status: b.status,
    recipientCount: b.recipient_count,
    sentCount: b.sent_count,
    sentAt: b.sent_at,
    createdAt: b.created_at,
  };
}

export async function listBroadcasts(): Promise<BroadcastRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("marketing_broadcasts")
    .select("id,subject,body_markdown,status,recipient_count,sent_count,sent_at,created_at")
    .order("created_at", { ascending: false });
  return ((data ?? []) as RawBroadcast[]).map(mapRow);
}

export async function getBroadcastById(id: string): Promise<BroadcastRow | null> {
  const admin = createAdminDbClient();
  const { data } = await admin.database
    .from("marketing_broadcasts")
    .select("id,subject,body_markdown,status,recipient_count,sent_count,sent_at,created_at")
    .eq("id", id)
    .maybeSingle<RawBroadcast>();
  return data ? mapRow(data) : null;
}

// The real send audience — every profile with a real email that hasn't
// opted out. No segment builder in v1 (deliberately, per
// context/RESUME.md's own scoping) — "all subscribed users" is the only
// audience.
export async function getEligibleRecipientCount(): Promise<number> {
  const admin = createAdminDbClient();
  const { count } = await admin.database
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("marketing_opt_out", false)
    .not("email", "is", null);
  return count ?? 0;
}
