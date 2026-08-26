"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

import { saveBroadcast, sendBroadcast, deleteBroadcast, generateDraft } from "@/actions/adminMarketing";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import type { AdminRole } from "@/lib/admin/auth";
import { SEGMENT_LABELS, type BroadcastRow, type BroadcastSegment } from "@/lib/admin/marketing";

export function BroadcastEditor({
  initialBroadcast,
  segmentCounts,
  viewerRole,
}: {
  initialBroadcast: BroadcastRow | null;
  segmentCounts: Record<BroadcastSegment, number>;
  viewerRole: AdminRole;
}) {
  const router = useRouter();
  const [id, setId] = useState(initialBroadcast?.id ?? null);
  const [subject, setSubject] = useState(initialBroadcast?.subject ?? "");
  const [body, setBody] = useState(initialBroadcast?.bodyMarkdown ?? "");
  const [segment, setSegment] = useState<BroadcastSegment>(initialBroadcast?.segment ?? "all");
  const [status, setStatus] = useState(initialBroadcast?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [brief, setBrief] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isGenerating, startGenerating] = useTransition();

  const canWrite = viewerRole === "owner" || viewerRole === "admin";
  const isDraft = status === "draft";
  const eligibleCount = segmentCounts[segment];

  function handleSave(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveBroadcast(id, subject, body, segment);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice("Saved.");
      if (!id) {
        setId(result.id);
        router.replace(`/admin/marketing/${result.id}`);
      }
    });
  }

  function handleSend(): void {
    if (!id) return;
    setError(null);
    startTransition(async () => {
      const result = await sendBroadcast(id);
      if (!result.success) {
        setError(result.error);
        setConfirmSend(false);
        return;
      }
      setStatus("sending");
      setConfirmSend(false);
      router.refresh();
    });
  }

  function handleDelete(): void {
    if (!id) return;
    startTransition(async () => {
      const result = await deleteBroadcast(id);
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push("/admin/marketing");
    });
  }

  function handleGenerateDraft(): void {
    if (!subject.trim()) {
      setError("Enter a subject first.");
      return;
    }
    setError(null);
    startGenerating(async () => {
      const result = await generateDraft(subject, brief);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setBody(result.bodyMarkdown);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}
      {!isDraft && (
        <p className="rounded-lg border border-border bg-surface-secondary px-4 py-2.5 text-xs text-text-secondary">
          This broadcast is {status} — no further edits possible.
        </p>
      )}
      {status === "sent" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Recipients" value={initialBroadcast?.recipientCount ?? "—"} />
          <StatCard label="Sent" value={initialBroadcast?.sentCount ?? 0} />
          <StatCard label="Opened" value={initialBroadcast?.openedCount ?? 0} />
          <StatCard label="Clicked" value={initialBroadcast?.clickedCount ?? 0} />
        </div>
      )}

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={!canWrite || !isDraft}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Audience</label>
            <select
              value={segment}
              onChange={(e) => setSegment(e.target.value as BroadcastSegment)}
              disabled={!canWrite || !isDraft}
              className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
            >
              {(Object.keys(SEGMENT_LABELS) as BroadcastSegment[]).map((s) => (
                <option key={s} value={s}>
                  {SEGMENT_LABELS[s]} ({segmentCounts[s]})
                </option>
              ))}
            </select>
          </div>
        </div>

        {canWrite && isDraft && (
          <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
            <div className="min-w-[240px] flex-1">
              <label className="mb-1 block text-[11px] font-medium text-text-muted">AI first-draft brief (optional)</label>
              <input
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="What should this email cover?"
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
              />
            </div>
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={isGenerating}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {isGenerating ? "Generating..." : "AI first draft"}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Message</h2>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={16}
            disabled={!canWrite || !isDraft}
            className="w-full rounded-md border border-border bg-surface-secondary px-3 py-2 font-mono text-xs text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
          />
        </div>
        <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
          <h2 className="mb-2 text-sm font-semibold text-text-primary">Preview</h2>
          <MarkdownContent markdown={body} />
        </div>
      </div>

      {canWrite && isDraft && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="btn-signal h-9 rounded-md px-4 text-sm font-medium text-accent-foreground disabled:opacity-60"
          >
            Save draft
          </button>
          {id && (
            <button
              type="button"
              onClick={() => setConfirmSend(true)}
              disabled={isPending}
              className="h-9 rounded-md border border-accent px-4 text-sm font-medium text-accent transition-colors hover:bg-accent-light disabled:opacity-60"
            >
              Send to {eligibleCount} recipients
            </button>
          )}
          {id && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="h-9 rounded-md border border-error/30 px-4 text-sm font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
            >
              Delete
            </button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmSend}
        title={`Send to ${eligibleCount} recipients?`}
        description={`This sends a real email to every user in "${SEGMENT_LABELS[segment]}". This can't be undone or recalled once sending starts.`}
        confirmLabel="Send"
        pending={isPending}
        onConfirm={handleSend}
        onCancel={() => setConfirmSend(false)}
      />
      <ConfirmDialog
        open={confirmDelete}
        title="Delete this broadcast?"
        description={`"${subject || "This broadcast"}" will be permanently deleted.`}
        confirmLabel="Delete"
        pending={isPending}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="mt-2 font-mono text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}
