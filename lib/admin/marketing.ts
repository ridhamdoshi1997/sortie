import { createAdminDbClient } from "@/lib/admin/client";
import { complete, getModel } from "@/lib/models";

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

  const raw = await complete(getModel("gemini", "smart"), {
    systemPrompt: BROADCAST_DRAFT_SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.5,
    maxTokens: 800,
  });

  return raw.trim();
}
