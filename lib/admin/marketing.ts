import { createAdminDbClient } from "@/lib/admin/client";
import { complete, getModel } from "@/lib/models";

export type BroadcastStatus = "draft" | "sending" | "sent" | "failed";
export type BroadcastSegment = "all" | "active_7d" | "inactive_30d";

export const SEGMENT_LABELS: Record<BroadcastSegment, string> = {
  all: "All subscribed users",
  active_7d: "Active in the last 7 days",
  inactive_30d: "Inactive 30+ days (win-back)",
};

export type BroadcastRow = {
  id: string;
  subject: string;
  bodyMarkdown: string;
  status: BroadcastStatus;
  segment: BroadcastSegment;
  recipientCount: number | null;
  sentCount: number;
  openedCount: number;
  clickedCount: number;
  sentAt: string | null;
  createdAt: string;
};

type RawBroadcast = {
  id: string;
  subject: string;
  body_markdown: string;
  status: BroadcastStatus;
  segment: BroadcastSegment;
  recipient_count: number | null;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
  sent_at: string | null;
  created_at: string;
};

const BROADCAST_COLUMNS = "id,subject,body_markdown,status,segment,recipient_count,sent_count,opened_count,clicked_count,sent_at,created_at";

function mapRow(b: RawBroadcast): BroadcastRow {
  return {
    id: b.id,
    subject: b.subject,
    bodyMarkdown: b.body_markdown,
    status: b.status,
    segment: b.segment,
    recipientCount: b.recipient_count,
    sentCount: b.sent_count,
    openedCount: b.opened_count,
    clickedCount: b.clicked_count,
    sentAt: b.sent_at,
    createdAt: b.created_at,
  };
}

export async function listBroadcasts(): Promise<BroadcastRow[]> {
  const admin = createAdminDbClient();
  const { data } = await admin.database.from("marketing_broadcasts").select(BROADCAST_COLUMNS).order("created_at", { ascending: false });
  return ((data ?? []) as RawBroadcast[]).map(mapRow);
}

export async function getBroadcastById(id: string): Promise<BroadcastRow | null> {
  const admin = createAdminDbClient();
  const { data } = await admin.database.from("marketing_broadcasts").select(BROADCAST_COLUMNS).eq("id", id).maybeSingle<RawBroadcast>();
  return data ? mapRow(data) : null;
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

// Real behavioral segmentation off Sortie's own usage data — client-side
// set logic over two lean fetches (eligible profiles, distinct
// usage_daily user_ids in the relevant window), same "fine at this
// project's scale" pattern used throughout lib/admin/*. More valuable
// than a generic tag/list system since it's a real signal no generic ESP
// has: who's actually using the product, not just who's subscribed.
export async function getSegmentRecipientCounts(): Promise<Record<BroadcastSegment, number>> {
  const admin = createAdminDbClient();

  const [{ data: eligibleProfiles }, { data: usageRows }] = await Promise.all([
    admin.database.from("profiles").select("id").eq("marketing_opt_out", false).not("email", "is", null),
    admin.database.from("usage_daily").select("user_id,day").gte("day", daysAgoIso(29)),
  ]);

  const eligibleIds = ((eligibleProfiles ?? []) as { id: string }[]).map((p) => p.id);
  const usage = (usageRows ?? []) as { user_id: string; day: string }[];

  const activeSince7d = new Set(usage.filter((u) => u.day >= daysAgoIso(6)).map((u) => u.user_id));
  const activeSince30d = new Set(usage.map((u) => u.user_id));

  return {
    all: eligibleIds.length,
    active_7d: eligibleIds.filter((id) => activeSince7d.has(id)).length,
    inactive_30d: eligibleIds.filter((id) => !activeSince30d.has(id)).length,
  };
}

export async function getSegmentUserIds(segment: BroadcastSegment): Promise<string[]> {
  const admin = createAdminDbClient();

  const { data: eligibleProfiles } = await admin.database.from("profiles").select("id").eq("marketing_opt_out", false).not("email", "is", null);
  const eligibleIds = ((eligibleProfiles ?? []) as { id: string }[]).map((p) => p.id);

  if (segment === "all") return eligibleIds;

  const { data: usageRows } = await admin.database
    .from("usage_daily")
    .select("user_id,day")
    .gte("day", daysAgoIso(segment === "active_7d" ? 6 : 29));
  const activeIds = new Set(((usageRows ?? []) as { user_id: string; day: string }[]).map((u) => u.user_id));

  return segment === "active_7d" ? eligibleIds.filter((id) => activeIds.has(id)) : eligibleIds.filter((id) => !activeIds.has(id));
}

const BROADCAST_DRAFT_SYSTEM_PROMPT = `You are drafting a first-pass marketing/product-update email for Sortie, a job-search copilot product for job seekers. Write clear, honest copy — no invented statistics, no fabricated customer quotes or testimonials, no claims about features the product doesn't have, no artificial urgency or hype-speak. This is a rough first draft an admin will review and edit before sending, not final copy.

Output ONLY the email body as plain text (short paragraphs, a blank line between them). No subject line (supplied separately), no greeting placeholder like "[Name]" (recipients aren't personalized by name), no signature block, no markdown formatting, no commentary before or after.`;

// AI-assisted first-draft button (direct user request) — same "real data
// in, honest AI draft out, human edits before publish" pattern as
// lib/admin/content.ts's generatePageDraft(), applied to broadcast email
// instead of a CMS page. Internal admin tooling, deliberately does NOT go
// through checkAndConsumeUsage — same reasoning as the Content draft
// button.
export async function generateBroadcastDraft(subject: string, brief: string): Promise<string> {
  const userPrompt = `Email subject: ${subject}\n\nWhat this email should cover: ${brief.trim() || "(no additional brief given — use the subject alone to infer intent)"}`;

  const raw = await complete(await getModel("gemini", "smart"), {
    systemPrompt: BROADCAST_DRAFT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 800,
  });

  return raw.trim();
}
