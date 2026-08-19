import { createAdminDbClient } from "@/lib/admin/client";
import type { TicketStatus } from "@/actions/support";

export type AdminTicketRow = {
  id: string;
  subject: string;
  status: TicketStatus;
  userEmail: string | null;
  assignedAdminEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTicketMessage = {
  id: string;
  authorType: "user" | "admin";
  authorEmail: string | null;
  body: string;
  createdAt: string;
};

type RawTicket = {
  id: string;
  subject: string;
  status: TicketStatus;
  user_id: string;
  assigned_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

// Same two-hop lookup pattern as lib/admin/queries.ts's getAdminNotes() —
// no direct FK-embed to profiles/admin_users' email via this project's
// PostgREST layer.
export async function listTickets(statusFilter: TicketStatus | "all"): Promise<AdminTicketRow[]> {
  const admin = createAdminDbClient();

  let query = admin.database
    .from("support_tickets")
    .select("id,subject,status,user_id,assigned_admin_id,created_at,updated_at")
    .order("updated_at", { ascending: false });

  if (statusFilter !== "all") {
    query = query.eq("status", statusFilter);
  }

  const { data } = await query;
  const tickets = (data ?? []) as RawTicket[];
  if (tickets.length === 0) return [];

  const userIds = Array.from(new Set(tickets.map((t) => t.user_id)));
  const { data: profiles } = await admin.database.from("profiles").select("id,email").in("id", userIds);
  const emailByUserId = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  const adminIds = Array.from(new Set(tickets.map((t) => t.assigned_admin_id).filter((id): id is string => id !== null)));
  const adminEmailByAdminId = await resolveAdminEmails(adminIds);

  return tickets.map((t) => ({
    id: t.id,
    subject: t.subject,
    status: t.status,
    userEmail: emailByUserId.get(t.user_id) ?? null,
    assignedAdminEmail: t.assigned_admin_id ? (adminEmailByAdminId.get(t.assigned_admin_id) ?? null) : null,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
  }));
}

async function resolveAdminEmails(adminIds: string[]): Promise<Map<string, string | null>> {
  const admin = createAdminDbClient();
  if (adminIds.length === 0) return new Map();

  const { data: adminUsers } = await admin.database.from("admin_users").select("id,user_id").in("id", adminIds);
  const adminUserRows = (adminUsers ?? []) as { id: string; user_id: string }[];

  const authUserIds = adminUserRows.map((a) => a.user_id);
  const { data: profiles } =
    authUserIds.length > 0
      ? await admin.database.from("profiles").select("id,email").in("id", authUserIds)
      : { data: [] as { id: string; email: string | null }[] };

  const emailByAuthUserId = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  return new Map(adminUserRows.map((a) => [a.id, emailByAuthUserId.get(a.user_id) ?? null]));
}

type AdminTicketDetail = { ticket: AdminTicketRow; messages: AdminTicketMessage[] } | null;

export async function getTicketDetail(ticketId: string): Promise<AdminTicketDetail> {
  const admin = createAdminDbClient();

  const { data: ticket } = await admin.database
    .from("support_tickets")
    .select("id,subject,status,user_id,assigned_admin_id,created_at,updated_at")
    .eq("id", ticketId)
    .maybeSingle<RawTicket>();

  if (!ticket) return null;

  const [{ data: profile }, adminEmailMap, { data: messages }] = await Promise.all([
    admin.database.from("profiles").select("email").eq("id", ticket.user_id).maybeSingle<{ email: string | null }>(),
    ticket.assigned_admin_id ? resolveAdminEmails([ticket.assigned_admin_id]) : Promise.resolve(new Map<string, string | null>()),
    admin.database
      .from("support_ticket_messages")
      .select("id,author_type,author_admin_id,body,created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
  ]);

  const messageRows = (messages ?? []) as { id: string; author_type: "user" | "admin"; author_admin_id: string | null; body: string; created_at: string }[];
  const messageAdminIds = Array.from(new Set(messageRows.map((m) => m.author_admin_id).filter((id): id is string => id !== null)));
  const messageAdminEmails = await resolveAdminEmails(messageAdminIds);

  return {
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      userEmail: profile?.email ?? null,
      assignedAdminEmail: ticket.assigned_admin_id ? (adminEmailMap.get(ticket.assigned_admin_id) ?? null) : null,
      createdAt: ticket.created_at,
      updatedAt: ticket.updated_at,
    },
    messages: messageRows.map((m) => ({
      id: m.id,
      authorType: m.author_type,
      authorEmail: m.author_type === "user" ? (profile?.email ?? null) : m.author_admin_id ? (messageAdminEmails.get(m.author_admin_id) ?? null) : null,
      body: m.body,
      createdAt: m.created_at,
    })),
  };
}
