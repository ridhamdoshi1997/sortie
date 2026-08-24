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

export type MyTicketSummary = {
  id: string;
  subject: string;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
};

export type TicketMessage = {
  id: string;
  authorType: "user" | "admin";
  body: string;
  createdAt: string;
};

type RawTicket = { id: string; subject: string; status: TicketStatus; created_at: string; updated_at: string };
type RawMessage = { id: string; author_type: "user" | "admin"; body: string; created_at: string };

export async function getMySupportTickets(): Promise<MyTicketSummary[]> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data } = await insforge.database
    .from("support_tickets")
    .select("id,subject,status,created_at,updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as RawTicket[]).map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

type TicketThreadResult =
  | { success: true; ticket: MyTicketSummary; messages: TicketMessage[] }
  | { success: false; error: string };

export async function getMySupportTicket(ticketId: string): Promise<TicketThreadResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: ticket } = await insforge.database
    .from("support_tickets")
    .select("id,subject,status,created_at,updated_at")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle<RawTicket>();

  if (!ticket) return { success: false, error: "Ticket not found." };

  const { data: messages } = await insforge.database
    .from("support_ticket_messages")
    .select("id,author_type,body,created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true });

  return {
    success: true,
    ticket: { id: ticket.id, subject: ticket.subject, status: ticket.status, createdAt: ticket.created_at, updatedAt: ticket.updated_at },
    messages: ((messages ?? []) as RawMessage[]).map((m) => ({
      id: m.id,
      authorType: m.author_type,
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}

type CreateTicketResult = { success: true; id: string } | { success: false; error: string };

export async function createSupportTicket(subject: string, body: string): Promise<CreateTicketResult> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedSubject) return { success: false, error: "Enter a subject." };
  if (!trimmedBody) return { success: false, error: "Enter a message." };

  const { data: ticket, error: ticketError } = await insforge.database
    .from("support_tickets")
    .insert([{ user_id: user.id, subject: trimmedSubject, status: "open" }])
    .select("id")
    .single<{ id: string }>();

  if (ticketError || !ticket) {
    return { success: false, error: toUserMessage(ticketError, "Failed to open a ticket.") };
  }

  const { error: messageError } = await insforge.database
    .from("support_ticket_messages")
    .insert([{ ticket_id: ticket.id, user_id: user.id, author_type: "user", body: trimmedBody }]);

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
