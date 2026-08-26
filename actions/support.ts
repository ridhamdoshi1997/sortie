"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createAdminDbClient } from "@/lib/admin/client";
import { toUserMessage } from "@/lib/errors";

// User-facing support tickets (admin console expansion item 4,
// context/RESUME.md's "needs a user-facing submission point too, not just
// the admin inbox"). Plain CRUD through the regular cookie-authenticated
// client — RLS (migration 20260819090000) does the real enforcement here,
// the explicit .eq("user_id", ...) filters are defense-in-depth/clarity,
// same convention as actions/careerEvents.ts.

export type TicketStatus = "open" | "pending" | "resolved";
export type TicketCategory = "bug" | "feature_request" | "change_request" | "feedback" | "billing" | "other" | "support";

export type MyTicketSummary = {
  id: string;
  subject: string;
  status: TicketStatus;
  category: TicketCategory;
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = {
  id: string;
  authorType: "user" | "admin";
  body: string;
  imageUrls: string[];
  createdAt: string;
};

type RawTicket = {
  id: string;
  subject: string;
  status: TicketStatus;
  category: TicketCategory;
  created_at: string;
  updated_at: string;
};
type RawMessage = {
  id: string;
  author_type: "user" | "admin";
  body: string;
  image_urls: string[] | null;
  created_at: string;
};

export async function getMySupportTickets(): Promise<MyTicketSummary[]> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("support_tickets")
    .select("id,subject,status,category,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as RawTicket[]).map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    category: t.category,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

// Feedback system (Phase 1, approved plan) — gates the richer Type/
// Screenshot submission form to owners/admins (who already have every
// day-to-day lever, per lib/admin/auth.ts's role comment) plus any user an
// admin has explicitly flagged profiles.is_tester. Everyone else keeps
// today's plain "Contact support" form unchanged; flipping this to always
// return true (or defaulting is_tester) is the one change needed for full
// rollout later — no separate build.
//
// admin_users has zero RLS policies (service-role only, same as every other
// admin_* table — see migration 20260819090000's own comment), so a regular
// user's cookie-authenticated client can't read it directly; the admin
// service-role client is required for that half of the check. profiles has
// its own-row SELECT policy already (read via the regular client elsewhere
// in this app, e.g. app/career/page.tsx).
export async function getFeedbackAccess(): Promise<{ isTesterOrAdmin: boolean }> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: profile } = await insforge.database
    .from("profiles")
    .select("is_tester")
    .eq("id", user.id)
    .maybeSingle<{ is_tester: boolean }>();

  if (profile?.is_tester) return { isTesterOrAdmin: true };

  const admin = createAdminDbClient();
  const { data: adminRow } = await admin.database
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle<{ role: "owner" | "admin" | "support_readonly" }>();

  return { isTesterOrAdmin: adminRow?.role === "owner" || adminRow?.role === "admin" };
}

// Screenshot upload for the feedback modal — a private bucket, same
// convention as the `resumes` bucket (actions/profile.ts: "store the
// storage path, not a public URL"). Returns the storage key; the caller
// collects keys client-side and passes them to createSupportTicket, which
// writes them onto the first message's image_urls (column name kept from
// the approved migration, holds keys not full URLs — matching how
// applications.resume_pdf_url already stores a path despite its name).
type UploadAttachmentResult = { success: true; key: string } | { success: false; error: string };

export async function uploadSupportAttachment(formData: FormData): Promise<UploadAttachmentResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const file = formData.get("file");
  if (!(file instanceof File)) return { success: false, error: "No file provided." };
  if (!file.type.startsWith("image/")) return { success: false, error: "Only image files are supported." };
  if (file.size > 8 * 1024 * 1024) return { success: false, error: "Image is too large (8MB max)." };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `${user.id}/${Date.now()}-${safeName}`;

  const { error } = await insforge.storage.from("support-attachments").upload(key, file);
  if (error) return { success: false, error: toUserMessage(error, "Failed to upload the image.") };

  return { success: true, key };
}

type TicketThreadResult =
  | { success: true; ticket: MyTicketSummary; messages: TicketMessage[] }
  | { success: false; error: string };

export async function getMySupportTicket(ticketId: string): Promise<TicketThreadResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: ticket } = await insforge.database
    .from("support_tickets")
    .select("id,subject,status,category,created_at,updated_at")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle<RawTicket>();

  if (!ticket) return { success: false, error: "Ticket not found." };

  const { data: messages } = await insforge.database
    .from("support_ticket_messages")
    .select("id,author_type,body,image_urls,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  return {
    success: true,
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      category: ticket.category,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    messages: ((messages ?? []) as RawMessage[]).map((m) => ({
      id: m.id,
      authorType: m.author_type,
      body: m.body,
      imageUrls: m.image_urls ?? [],
      createdAt: m.created_at,
    })),
  };
}

type CreateTicketResult = { success: true; id: string } | { success: false; error: string };

// category/pageUrl/userAgent/imageKeys are all optional and default to the
// plain pre-Phase-1 behavior — the existing "Contact support" form (shown
// to non-testers) can keep calling this with just (subject, body).
export async function createSupportTicket(
  subject: string,
  body: string,
  options?: { category?: TicketCategory; pageUrl?: string; userAgent?: string; imageKeys?: string[] },
): Promise<CreateTicketResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedSubject) return { success: false, error: "Enter a subject." };
  if (!trimmedBody) return { success: false, error: "Enter a message." };

  const { data: ticket, error: ticketError } = await insforge.database
    .from("support_tickets")
    .insert([
      {
        user_id: user.id,
        subject: trimmedSubject,
        status: "open",
        category: options?.category ?? "support",
        page_url: options?.pageUrl ?? null,
        user_agent: options?.userAgent ?? null,
      },
    ])
    .select("id")
    .single<{ id: string }>();

  if (ticketError || !ticket) {
    return { success: false, error: toUserMessage(ticketError, "Failed to open a ticket.") };
  }

  const { error: messageError } = await insforge.database.from("support_ticket_messages").insert([
    {
      ticket_id: ticket.id,
      user_id: user.id,
      author_type: "user",
      body: trimmedBody,
      image_urls: options?.imageKeys ?? [],
    },
  ]);

  if (messageError) {
    return { success: false, error: toUserMessage(messageError, "Ticket created, but your message failed to save — try replying to it.") };
  }

  revalidatePath("/settings");
  return { success: true, id: ticket.id };
}

type ActionResult = { success: true } | { success: false; error: string };

export async function replyToMySupportTicket(ticketId: string, body: string): Promise<ActionResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const trimmedBody = body.trim();
  if (!trimmedBody) return { success: false, error: "Enter a message." };

  const { data: ticket } = await insforge.database
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!ticket) return { success: false, error: "Ticket not found." };

  const { error } = await insforge.database
    .from("support_ticket_messages")
    .insert([{ ticket_id: ticketId, user_id: user.id, author_type: "user", body: trimmedBody }]);

  if (error) return { success: false, error: toUserMessage(error, "Failed to send your reply.") };

  // Reopening the ticket is a system-maintained field, not user-authored
  // content — the RLS-protected SELECT above already proved this user owns
  // the ticket, so this one narrow status flip goes through the
  // service-role client rather than adding a real "own-row" UPDATE policy
  // (which would let a user directly write assigned_admin_id too, more
  // surface than this actually needs). A reply on any status (open,
  // pending-on-user, or resolved) puts it back in the admin queue.
  const admin = createAdminDbClient();
  await admin.database.from("support_tickets").update({ status: "open", updated_at: new Date().toISOString() }).eq("id", ticketId);

  revalidatePath("/settings");
  return { success: true };
}
