"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin, requireRole } from "@/lib/admin/auth";
import { createAdminDbClient } from "@/lib/admin/client";
import { logAdminAction } from "@/lib/admin/audit";
import { listTickets, getTicketDetail, type AdminTicketRow, type AdminTicketMessage } from "@/lib/admin/support";
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

    const { error: messageError } = await client.database
      .from("support_ticket_messages")
      .insert([{ ticket_id: ticketId, user_id: (await getTicketOwnerId(ticketId)) ?? "", author_type: "admin", author_admin_id: admin.id, body: trimmedBody }]);

    if (messageError) return { success: false, error: toUserMessage(messageError, "Failed to send this reply.") };

    // A reply from an admin moves the ticket to "pending" — waiting on the
    // user now, not sitting untouched in the open queue.
    const { error: statusError } = await client.database
      .from("support_tickets")
      .update({ status: "pending", assigned_admin_id: admin.id, updated_at: new Date().toISOString() })
      .eq("id", ticketId);

    if (statusError) return { success: false, error: toUserMessage(statusError, "Reply sent, but the ticket status failed to update.") };

    await logAdminAction(admin, { action: "reply_support_ticket", targetTable: "support_tickets", targetId: ticketId });

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}

async function getTicketOwnerId(ticketId: string): Promise<string | null> {
  const client = createAdminDbClient();
  const { data } = await client.database.from("support_tickets").select("user_id").eq("id", ticketId).maybeSingle<{ user_id: string }>();
  return data?.user_id ?? null;
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
  try {
    const admin = await requireAdmin();
    requireRole(admin, ["owner", "admin"]);
    const client = createAdminDbClient();

    const { error } = await client.database.from("support_tickets").update({ assigned_admin_id: admin.id, updated_at: new Date().toISOString() }).eq("id", ticketId);
    if (error) return { success: false, error: toUserMessage(error, "Failed to assign this ticket.") };

    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${ticketId}`);
    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
