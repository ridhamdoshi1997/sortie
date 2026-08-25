"use client";

import { useEffect, useState, useTransition } from "react";
import { LifeBuoy, Send } from "lucide-react";

import { createSupportTicket, getMySupportTickets, getMySupportTicket, replyToMySupportTicket } from "@/actions/support";
import type { MyTicketSummary, TicketMessage, TicketStatus } from "@/actions/support";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Awaiting reply", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

// User-facing support submission (admin console expansion item 4,
// context/RESUME.md), embedded as a Settings tab rather than a standalone
// page — matches how "Browser extension" already hosts a self-contained
// key-management UI in the same slot.
export function SupportTab() {
  const [tickets, setTickets] = useState<MyTicketSummary[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: MyTicketSummary; messages: TicketMessage[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getMySupportTickets().then(setTickets);
  }, []);

  function refreshList(): void {
    startTransition(async () => {
      const t = await getMySupportTickets();
      setTickets(t);
    });
  }

  function openTicket(id: string): void {
    setSelectedId(id);
    setError(null);
    startTransition(async () => {
      const result = await getMySupportTicket(id);
      if (result.success) setThread({ ticket: result.ticket, messages: result.messages });
    });
  }

  function handleCreate(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSupportTicket(subject, body);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSubject("");
      setBody("");
      refreshList();
      openTicket(result.id);
    });
  }

  function handleReply(): void {
    if (!selectedId || !reply.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await replyToMySupportTicket(selectedId, reply);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setReply("");
      openTicket(selectedId);
      refreshList();
    });
  }

  if (selectedId && thread) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => { setSelectedId(null); setThread(null); }} className="w-fit text-xs font-medium text-text-secondary hover:text-text-primary">
          ← Back to tickets
        </button>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-primary">{thread.ticket.subject}</h2>
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[thread.ticket.status]}`}>{STATUS_LABELS[thread.ticket.status]}</span>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex flex-col gap-2.5">
          {thread.messages.map((m) => (
            <div key={m.id} className={`rounded-xl border p-3.5 ${m.authorType === "admin" ? "border-accent/20 bg-accent-light/40" : "border-border bg-surface-secondary"}`}>
              <p className="text-sm leading-6 text-text-primary">{m.body}</p>
              <p className="mt-1 text-xs text-text-muted">{m.authorType === "admin" ? "Sortie support" : "You"} · {formatDate(m.createdAt)}</p>
            </div>
          ))}
        </div>
        <div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Write a reply…"
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={handleReply}
            disabled={isPending || !reply.trim()}
            className="btn-signal mt-2 inline-flex h-9 items-center gap-1.5 rounded-lg px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            <Send className="h-3.5 w-3.5" />
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <LifeBuoy className="h-4 w-4 text-text-secondary" />
          <h2 className="text-sm font-semibold text-text-primary">Contact support</h2>
        </div>
        <form onSubmit={handleCreate} className="flex flex-col gap-2">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            required
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's going on?"
            rows={3}
            required
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          {error && <p className="text-xs text-error">{error}</p>}
          <button
            type="submit"
            disabled={isPending}
            className="btn-signal inline-flex h-9 w-fit items-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Send message
          </button>
        </form>
      </div>

      <div>
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted">Your tickets</p>
        {tickets === null ? (
          <p className="text-xs text-text-muted">Loading…</p>
        ) : tickets.length === 0 ? (
          <p className="text-xs text-text-muted">No tickets yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {tickets.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => openTicket(t.id)}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-secondary px-3 py-2.5 text-left transition-colors hover:bg-border/30"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-text-primary">{t.subject}</p>
                  <p className="text-[11px] text-text-muted">{formatDate(t.updatedAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
