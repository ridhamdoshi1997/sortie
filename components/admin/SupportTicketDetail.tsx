"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Sparkles, Trash2 } from "lucide-react";

import {
  deleteTicket,
  generateReplyDraft,
  getAdminTicketDetail,
  reassignTicket,
  replyToTicketAsAdmin,
  setTicketAgentStatus,
  setTicketOpsNote,
  setTicketStatus,
  updateTicketSubject,
} from "@/actions/adminSupport";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminTicketMessage, AdminTicketRow, AgentStatus } from "@/lib/admin/support";
import type { AdminRole } from "@/lib/admin/auth";
import type { AdminRosterRow } from "@/lib/admin/queries";
import type { TicketCategory, TicketStatus } from "@/actions/support";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Pending", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};
const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: "Bug",
  feature_request: "Feature request",
  change_request: "Change request",
  feedback: "Feedback",
  billing: "Subscription & billing",
  other: "Other",
  support: "Support",
};
const AGENT_STATUS_LABELS: Record<AgentStatus, string> = {
  none: "Not queued",
  ready_for_ai: "Ready for AI",
  ai_in_progress: "AI in progress",
  pr_open: "PR open",
  ai_done: "AI done",
};
const AGENT_STATUS_CHIP_CLASS: Record<AgentStatus, string> = {
  none: "bg-surface-secondary text-text-muted",
  ready_for_ai: "bg-agent-light text-agent-dark",
  ai_in_progress: "bg-info-light text-info",
  pr_open: "bg-warning/10 text-warning",
  ai_done: "bg-agent-light text-agent-dark",
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SupportTicketDetail({
  initialTicket,
  initialMessages,
  viewerRole,
  admins,
}: {
  initialTicket: AdminTicketRow;
  initialMessages: AdminTicketMessage[];
  viewerRole: AdminRole;
  admins: AdminRosterRow[];
}) {
  const router = useRouter();
  const [ticket, setTicket] = useState(initialTicket);
  const [messages, setMessages] = useState(initialMessages);
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSubject, setEditingSubject] = useState(false);
  const [subjectInput, setSubjectInput] = useState(initialTicket.subject);
  const [opsNoteInput, setOpsNoteInput] = useState(initialTicket.opsNote ?? "");
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

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

  function handleGenerateDraft(): void {
    setError(null);
    startGenerating(async () => {
      const result = await generateReplyDraft(ticket.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setReply(result.body);
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

  function handleReassign(adminUserId: string): void {
    setError(null);
    startTransition(async () => {
      const result = await reassignTicket(ticket.id, adminUserId || null);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function handleDelete(): void {
    startTransition(async () => {
      const result = await deleteTicket(ticket.id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/support");
    });
  }

  function handleAgentStatusChange(status: AgentStatus): void {
    setError(null);
    startTransition(async () => {
      const result = await setTicketAgentStatus(ticket.id, status);
      if (!result.success) {
        setError(result.error);
        return;
      }
      refresh();
    });
  }

  function handleSaveOpsNote(): void {
    setError(null);
    startTransition(async () => {
      const result = await setTicketOpsNote(ticket.id, opsNoteInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setTicket((prev) => ({ ...prev, opsNote: opsNoteInput.trim() || null }));
    });
  }

  function handleSaveSubject(): void {
    if (!subjectInput.trim() || subjectInput.trim() === ticket.subject) {
      setEditingSubject(false);
      setSubjectInput(ticket.subject);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateTicketSubject(ticket.id, subjectInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setTicket((prev) => ({ ...prev, subject: subjectInput.trim() }));
      setEditingSubject(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {editingSubject ? (
              <div className="flex items-center gap-2">
                <input
                  value={subjectInput}
                  onChange={(e) => setSubjectInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveSubject()}
                  autoFocus
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2 text-lg font-semibold text-text-primary outline-none focus-visible:border-accent"
                />
                <button type="button" onClick={handleSaveSubject} disabled={isPending} className="text-xs font-medium text-accent hover:underline">
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingSubject(false);
                    setSubjectInput(ticket.subject);
                  }}
                  className="text-xs font-medium text-text-muted hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-text-primary">{ticket.subject}</h1>
                {canWrite && (
                  <button type="button" onClick={() => setEditingSubject(true)} aria-label="Edit subject" className="text-text-muted hover:text-text-primary">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-text-muted">
              {ticket.userEmail ?? "Unknown user"} · Assigned: {ticket.assignedAdminEmail ?? "Unassigned"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {ticket.category !== "support" && (
              <span className="rounded-full bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-secondary">{CATEGORY_LABELS[ticket.category]}</span>
            )}
            <span className={`rounded-full px-3 py-1.5 text-xs font-medium ${STATUS_CHIP_CLASS[ticket.status]}`}>{STATUS_LABELS[ticket.status]}</span>
          </div>
        </div>

        {canWrite && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-4">
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
            <select
              value={ticket.assignedAdminId ?? ""}
              onChange={(e) => handleReassign(e.target.value)}
              disabled={isPending}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs text-text-secondary outline-none focus-visible:border-accent disabled:opacity-60"
            >
              <option value="">Unassigned</option>
              {admins.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.email ?? a.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
            >
              <Trash2 className="h-3 w-3" />
              Delete
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
            {m.imageUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {m.imageUrls.map((key) => (
                  <a
                    key={key}
                    href={`/api/support/attachment?key=${encodeURIComponent(key)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-16 w-16 overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- private-bucket image, served through an authed route, not next/image-cacheable */}
                    <img src={`/api/support/attachment?key=${encodeURIComponent(key)}`} alt="Attached screenshot" className="h-full w-full object-cover" />
                  </a>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-text-muted">
              {m.authorType === "admin" ? (m.authorEmail ?? "Admin") : (m.authorEmail ?? "User")} · {formatDateTime(m.createdAt)}
            </p>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <div className="flex items-center justify-between gap-2">
            <label className="block text-[11px] font-medium text-text-muted">Agent status</label>
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${AGENT_STATUS_CHIP_CLASS[ticket.agentStatus]}`}>
              {AGENT_STATUS_LABELS[ticket.agentStatus]}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {(["none", "ready_for_ai", "ai_in_progress", "pr_open", "ai_done"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleAgentStatusChange(s)}
                disabled={isPending || ticket.agentStatus === s}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
              >
                {AGENT_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <label className="mt-4 mb-1 block text-[11px] font-medium text-text-muted">
            Ops note <span className="font-normal normal-case text-text-muted/70">— technical context for whoever (or whatever) picks this up</span>
          </label>
          <textarea
            value={opsNoteInput}
            onChange={(e) => setOpsNoteInput(e.target.value)}
            rows={2}
            placeholder="e.g. Null pointer in BillingCard.tsx when planEndsAt is missing"
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={handleSaveOpsNote}
            disabled={isPending || opsNoteInput === (ticket.opsNote ?? "")}
            className="mt-2 h-8 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-40"
          >
            Save note
          </button>
        </div>
      )}

      {canWrite && (
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-[11px] font-medium text-text-muted">Reply</label>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={isGenerating}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-text-secondary transition-colors hover:text-text-primary disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Generating..." : "AI draft reply"}
            </button>
          </div>
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
            className="btn-signal mt-2 h-9 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Send reply
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this ticket?"
        description={`"${ticket.subject}" and its entire message thread will be permanently deleted.`}
        confirmLabel="Delete"
        pending={isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
