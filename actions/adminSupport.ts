"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { listTickets, getTicketDetail, type AdminTicketRow, type AdminTicketMessage } from "@/lib/admin/support";
import { sendSupportReplyEmail } from "@/lib/email/resend";
import type { TicketStatus } from "@/actions/support";
import { toUserMessage } from "@/lib/errors";

// Support inbox (admin console expansion item 4, context/RESUME.md). Same
// requireAdmin()-inside-every-action pattern as the rest of /admin.
// support_readonly can read everything here (matches its "full read access
// everywhere, zero write actions" definition from Team & Roles) — reply/
// status/assign are gated owner+admin, same tier as suspend/usage-cap.
type ActionResult = { success: true } | { success: false; error: string };

type TicketsListResult = { success: true; tickets: AdminTicketRow[] } | { success: false; error: string };

export async function getAdminTicketsList(statusFilter: TicketStatus | "all"): Promise<TicketsListResult> {
  try {
    await requireAdmin();
    const tickets = await listTickets(statusFilter);
    return { success: true, tickets };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

type TicketDetailResult =
  | { success: true; ticket: AdminTicketRow; messages: AdminTicketMessage[] }
  | { success: false; error: string };

export async function getAdminTicketDetail(ticketId: string): Promise<TicketDetailResult> {
  try {
    await requireAdmin();
    const detail = await getTicketDetail(ticketId);
    if (!detail) return { success: false, error: "Ticket not found." };
    return { success: true, ...detail };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function replyToTicketAsAdmin(ticketId: string, body: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const trimmedBody = body.trim();
    if (!trimmedBody) return { success: false, error: "Enter a message." };

    const { data: ticket } = await client.database.from("support_tickets").select("user_id,subject").eq("id", ticketId).maybeSingle<{ user_id: string; subject: string }>();
    if (!ticket) return { success: false, error: "Ticket not found." };

    const { error: messageError } = await client.database
      .from("support_ticket_messages")
      .insert([{ ticket_id: ticketId, user_id: ticket.user_id, author_type: "admin", author_admin_id: admin.id, body: trimmedBody }]);

    if (messageError) return { success: false, error: toUserMessage(messageError, "Failed to send this reply.") };

    // A reply from an admin moves the ticket to "pending" — waiting on the
    // user now, not sitting untouched in the open queue.
    const { error: statusError } = await client.database
      .from("support_tickets")
      .update({ status: "pending", assigned_admin_id: admin.id, updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    if (statusError) return { success: false, error: toUserMessage(statusError, "Reply sent, but the ticket status failed to update.") };

    await logAdminAction(admin, { action: "reply_support_ticket", targetTable: "support_tickets", targetId: ticketId });

    // Best-effort real email to the user — see lib/email/resend.ts for why
    // this is currently inert (no verified domain yet). after() so this
    // runs post-response without risking the serverless function being
    // torn down mid-send, same pattern as app/find-jobs/[id]/page.tsx's
    // last_viewed_at write.
    const { data: profile } = await client.database.from("profiles").select("email").eq("id", ticket.user_id).maybeSingle<{ email: string | null }>();
    if (profile?.email) {
      after(() => sendSupportReplyEmail({ to: profile.email!, subject: ticket.subject, body: trimmedBody, ticketId }));
    }

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("support_tickets").update({ status, updated_at: new Date().toISOString() }).eq("id", ticketId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to update this ticket's status.") };

    await logAdminAction(admin, { action: "set_ticket_status", targetTable: "support_tickets", targetId: ticketId, after: { status } });

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function assignTicketToSelf(ticketId: string): Promise<ActionResult> {
  return reassignTicket(ticketId, null, true);
}

// null adminUserId = unassign. assignToSelf bypasses the picker for the
// common one-click case; the admin picker in the UI calls this directly
// with a chosen admin_users.id.
export async function reassignTicket(ticketId: string, adminUserId: string | null, assignToSelf = false): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const targetId = assignToSelf ? admin.id : adminUserId;

    const { error } = await client.database
      .from("support_tickets")
      .update({ assigned_admin_id: targetId, updated_at: new Date().toISOString() })
      .eq("id", ticketId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to assign this ticket.") };

    await logAdminAction(admin, { action: "reassign_support_ticket", targetTable: "support_tickets", targetId: ticketId, after: { assignedAdminId: targetId } });

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

export async function deleteTicket(ticketId: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { data: ticket } = await client.database.from("support_tickets").select("subject").eq("id", ticketId).maybeSingle<{ subject: string }>();
    if (!ticket) return { success: false, error: "Ticket not found." };

    const { error } = await client.database.from("support_tickets").delete().eq("id", ticketId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to delete this ticket.") };

    await logAdminAction(admin, { action: "delete_support_ticket", targetTable: "support_tickets", targetId: ticketId, before: { subject: ticket.subject } });

    revalidatePath("/admin/support");
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

// Manual ticket creation (direct user request) — for a phone call, a
// walk-up conversation, or any real support contact that didn't come
// through the app or (once configured) email. The admin picks a real
// Sortie account by email (same "must already have an account" pattern as
// Team & Roles' addAdmin) and the opening note is authored as the admin,
// not impersonating the user's own voice.
type CreateTicketResult = { success: true; id: string } | { success: false; error: string };

export async function createTicketAsAdmin(userEmail: string, subject: string, note: string): Promise<CreateTicketResult> {
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const trimmedEmail = userEmail.trim().toLowerCase();
    const trimmedSubject = subject.trim();
    const trimmedNote = note.trim();
    if (!trimmedEmail) return { success: false, error: "Enter the user's email." };
    if (!trimmedSubject) return { success: false, error: "Enter a subject." };
    if (!trimmedNote) return { success: false, error: "Enter an opening note." };

    const { data: profile } = await client.database.from("profiles").select("id").eq("email", trimmedEmail).maybeSingle<{ id: string }>();
    if (!profile) return { success: false, error: "No Sortie account found for that email." };

    const { data: ticket, error: ticketError } = await client.database
      .from("support_tickets")
      .insert([{ user_id: profile.id, subject: trimmedSubject, status: "open", assigned_admin_id: admin.id }])
      .select("id")
      .single<{ id: string }>();
    if (ticketError || !ticket) return { success: false, error: toUserMessage(ticketError, "Failed to create this ticket.") };

    const { error: messageError } = await client.database
      .from("support_ticket_messages")
      .insert([{ ticket_id: ticket.id, user_id: profile.id, author_type: "admin", author_admin_id: admin.id, body: trimmedNote }]);
    if (messageError) return { success: false, error: toUserMessage(messageError, "Ticket created, but the opening note failed to save.") };

    await logAdminAction(admin, { action: "create_support_ticket", targetUserId: profile.id, targetTable: "support_tickets", targetId: ticket.id, after: { subject: trimmedSubject } });

    revalidatePath("/admin/support");
    return { success: true, id: ticket.id };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
