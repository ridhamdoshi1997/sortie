"use client";

import { useState, useTransition } from "react";

import { assignTicketToSelf, getAdminTicketDetail, replyToTicketAsAdmin, setTicketStatus } from "@/actions/adminSupport";
import type { AdminTicketMessage, AdminTicketRow } from "@/lib/admin/support";
import type { AdminRole } from "@/lib/admin/auth";
import type { TicketStatus } from "@/actions/support";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Pending", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SupportTicketDetail({
  initialTicket,
  initialMessages,
  viewerRole,
}: {
  initialTicket: AdminTicketRow;
  initialMessages: AdminTicketMessage[];
  viewerRole: AdminRole;
}) {
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  // Refetches the full detail rather than hand-patching local state —
  // every write here (reply, status change, assign) can touch more than
  // one field server-side (a reply also sets status + assigned_admin_id),
  // so a partial optimistic patch would drift from real state.
  function refresh(): void {
    startTransition(async () => {
      const result = await getAdminTicketDetail(ticket.id);
      if (result.success) {
        setTicket(result.ticket);
        setMessages(result.messages);
      }
    });
  }

  function handleReply(): void {
    if (!reply.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await replyToTicketAsAdmin(ticket.id, reply);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setReply("");
      refresh();
    });
  }

  function handleStatusChange(status: TicketStatus): void {
    setError(null);
    startTransition(async () => {
      const result = await setTicketStatus(ticket.id, status);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function handleAssignToSelf(): void {
    setError(null);
    startTransition(async () => {
      const result = await assignTicketToSelf(ticket.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-text-primary">{ticket.subject}</h1>
            <p className="mt-1 text-xs text-text-muted">
              {ticket.userEmail ?? "Unknown user"} · Assigned: {ticket.assignedAdminEmail ?? "Unassigned"}
            </p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_CHIP_CLASS[ticket.status]}`}>{STATUS_LABELS[ticket.status]}</span>
        </div>

        {canWrite && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
            {(["open", "pending", "resolved"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleStatusChange(s)}
                disabled={isPending || ticket.status === s}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
              >
                Mark {STATUS_LABELS[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAssignToSelf}
              disabled={isPending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              Assign to me
            </button>
          </div>
        )}
      </div>

      {error && <p className="text-xs text-error">{error}</p>}

      <div className="flex flex-col gap-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-3.5 ${m.authorType === "admin" ? "border-accent/20 bg-accent-light/40" : "border-border bg-surface-secondary"}`}
          >
            <p className="text-sm leading-6 text-text-primary">{m.body}</p>
            <p className="mt-1 text-xs text-text-muted">
              {m.authorType === "admin" ? (m.authorEmail ?? "Admin") : (m.authorEmail ?? "User")} · {formatDateTime(m.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Reply</label>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={handleReply}
            disabled={isPending || !reply.trim()}
            className="mt-2 h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Send reply
          </button>
        </div>
      )}
    </div>
  );
}
