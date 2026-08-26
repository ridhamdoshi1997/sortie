"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Bug, CreditCard, LifeBuoy, Lightbulb, MessageSquare, MoreHorizontal, Paperclip, Send, Wrench, X } from "lucide-react";

import {
  createSupportTicket,
  getFeedbackAccess,
  getMySupportTickets,
  getMySupportTicket,
  replyToMySupportTicket,
  uploadSupportAttachment,
} from "@/actions/support";
import type { MyTicketSummary, TicketCategory, TicketMessage, TicketStatus } from "@/actions/support";
import { SectionModal } from "@/components/profile/SectionModal";

const STATUS_LABELS: Record<TicketStatus, string> = { open: "Open", pending: "Awaiting reply", resolved: "Resolved" };
const STATUS_CHIP_CLASS: Record<TicketStatus, string> = {
  open: "bg-warning/10 text-warning",
  pending: "bg-info-light text-info",
  resolved: "bg-agent-light text-agent-dark",
};

// "support" (plain contact-support, the pre-Phase-1 default) deliberately
// has no badge below — it's the un-categorized case and showing a label
// for it would just be noise on every ticket a non-tester ever files.
const CATEGORY_OPTIONS: { value: Exclude<TicketCategory, "support">; label: string; icon: typeof Bug }[] = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "feature_request", label: "Feature", icon: Lightbulb },
  { value: "change_request", label: "Change", icon: Wrench },
  { value: "feedback", label: "Feedback", icon: MessageSquare },
  { value: "billing", label: "Billing", icon: CreditCard },
  { value: "other", label: "Other", icon: MoreHorizontal },
];
const CATEGORY_LABELS: Record<TicketCategory, string> = {
  bug: "Bug",
  feature_request: "Feature request",
  change_request: "Change request",
  feedback: "Feedback",
  billing: "Subscription & billing",
  other: "Other",
  support: "Support",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

type PendingImage = { key: string; previewUrl: string };

// User-facing support submission (admin console expansion item 4,
// context/RESUME.md), embedded as a Settings tab. Phase 1 of the approved
// feedback-system plan layers a richer Type/Screenshot modal on top of the
// original plain form — gated to testers/admins via getFeedbackAccess()
// (profiles.is_tester OR admin_users role owner/admin) so non-testers see
// exactly today's simple "Contact support" form, unchanged, until the full
// rollout later just flips that one gate.
export function SupportTab() {
  const [tickets, setTickets] = useState<MyTicketSummary[] | null>(null);
  const [canUseFeedbackForm, setCanUseFeedbackForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ ticket: MyTicketSummary; messages: TicketMessage[] } | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [modalOpen, setModalOpen] = useState(false);
  const [category, setCategory] = useState<Exclude<TicketCategory, "support">>("bug");
  const [images, setImages] = useState<PendingImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getMySupportTickets().then(setTickets);
    getFeedbackAccess().then((r) => setCanUseFeedbackForm(r.isTesterOrAdmin));
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

  function resetForm(): void {
    setSubject("");
    setBody("");
    setImages([]);
    setCategory("bug");
  }

  async function uploadFile(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    const previewUrl = URL.createObjectURL(file);
    const formData = new FormData();
    formData.append("file", file);
    const result = await uploadSupportAttachment(formData);
    setUploading(false);
    if (!result.success) {
      setError(result.error);
      URL.revokeObjectURL(previewUrl);
      return;
    }
    setImages((prev) => [...prev, { key: result.key, previewUrl }]);
  }

  function handlePaste(e: React.ClipboardEvent): void {
    const item = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) uploadFile(file);
  }

  function removeImage(key: string): void {
    setImages((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }

  function handleModalSubmit(): void {
    setError(null);
    startTransition(async () => {
      const result = await createSupportTicket(subject, body, {
        category,
        pageUrl: window.location.pathname,
        userAgent: navigator.userAgent,
        imageKeys: images.map((i) => i.key),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      resetForm();
      setModalOpen(false);
      refreshList();
      openTicket(result.id);
    });
  }

  function handleSimpleCreate(e: React.FormEvent): void {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createSupportTicket(subject, body);
      if (!result.success) {
        setError(result.error);
        return;
      }
      resetForm();
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
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-text-primary">{thread.ticket.subject}</h2>
          <div className="flex shrink-0 items-center gap-2">
            {thread.ticket.category !== "support" && (
              <span className="rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-text-secondary">
                {CATEGORY_LABELS[thread.ticket.category]}
              </span>
            )}
            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[thread.ticket.status]}`}>{STATUS_LABELS[thread.ticket.status]}</span>
          </div>
        </div>
        {error && <p className="text-xs text-error">{error}</p>}
        <div className="flex flex-col gap-2.5">
          {thread.messages.map((m) => (
            <div key={m.id} className={`rounded-xl border p-3.5 ${m.authorType === "admin" ? "border-accent/20 bg-accent-light/40" : "border-border bg-surface-secondary"}`}>
              <p className="text-sm leading-6 text-text-primary">{m.body}</p>
              {m.imageUrls.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.imageUrls.map((key) => (
                    <a
                      key={key}
                      href={`/api/support/attachment?key=${encodeURIComponent(key)}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
                    >
                      <Paperclip className="h-3 w-3" />
                      Screenshot
                    </a>
                  ))}
                </div>
              )}
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
          <h2 className="text-sm font-semibold text-text-primary">{canUseFeedbackForm ? "Feedback & support" : "Contact support"}</h2>
        </div>

        {canUseFeedbackForm ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="btn-signal inline-flex h-9 w-fit items-center gap-2 rounded-lg px-4 text-sm font-medium text-accent-foreground"
          >
            Log the support ticket
          </button>
        ) : (
          <form onSubmit={handleSimpleCreate} className="flex flex-col gap-2">
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
              Log the support ticket
            </button>
          </form>
        )}
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
                <div className="flex shrink-0 items-center gap-2">
                  {t.category !== "support" && (
                    <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-medium text-text-secondary">{CATEGORY_LABELS[t.category]}</span>
                  )}
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_CHIP_CLASS[t.status]}`}>{STATUS_LABELS[t.status]}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {modalOpen && (
        <SectionModal
          title="Report a bug or request something"
          onClose={() => {
            setModalOpen(false);
            resetForm();
            setError(null);
          }}
          onSave={handleModalSubmit}
          saving={isPending}
          saveLabel="Log the support ticket"
          savingLabel="Logging…"
        >
          <div className="flex flex-col gap-4" onPaste={handlePaste}>
            <div>
              <p className="mb-2 text-xs font-medium text-text-secondary">Type</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setCategory(value)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      category === value
                        ? "border-accent bg-accent-light/40 text-accent-dark"
                        : "border-border text-text-secondary hover:bg-surface-secondary"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Summarize it in a few words"
              required
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What happened? What were you trying to do?"
              rows={4}
              required
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
            />

            <div>
              <p className="mb-2 text-xs font-medium text-text-secondary">
                Screenshots <span className="font-normal text-text-muted">— take one, then paste it here (Ctrl/Cmd+V)</span>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {images.map((img) => (
                  <div key={img.key} className="group relative h-16 w-16 overflow-hidden rounded-lg border border-border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not a remote image */}
                    <img src={img.previewUrl} alt="Screenshot preview" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(img.key)}
                      aria-label="Remove screenshot"
                      className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-60"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadFile(file);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {error && <p className="text-xs text-error">{error}</p>}
          </div>
        </SectionModal>
      )}
    </div>
  );
}
