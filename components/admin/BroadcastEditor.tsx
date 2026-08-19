"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { saveBroadcast, sendBroadcast, deleteBroadcast } from "@/actions/adminMarketing";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MarkdownContent } from "@/components/shared/MarkdownContent";
import type { AdminRole } from "@/lib/admin/auth";
import type { BroadcastRow } from "@/lib/admin/marketing";

export function BroadcastEditor({
  initialBroadcast,
  eligibleCount,
  viewerRole,
}: {
  initialBroadcast: BroadcastRow | null;
  eligibleCount: number;
  viewerRole: AdminRole;
}) {
  const router = useRouter();
  const [id, setId] = useState(initialBroadcast?.id ?? null);
  const [subject, setSubject] = useState(initialBroadcast?.subject ?? "");
  const [body, setBody] = useState(initialBroadcast?.bodyMarkdown ?? "");
  const [status, setStatus] = useState(initialBroadcast?.status ?? "draft");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canWrite = viewerRole === "owner" || viewerRole === "admin";
  const isDraft = status === "draft";

  function handleSave(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await saveBroadcast(id, subject, body);
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

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}
      {!isDraft && (
        <p className="rounded-lg border border-border bg-surface-secondary px-4 py-2.5 text-xs text-text-secondary">
          This broadcast is {status} — no further edits possible.
        </p>
      )}

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <label className="mb-1 block text-[11px] font-medium text-text-muted">Subject</label>
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={!canWrite || !isDraft}
          className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent disabled:opacity-60"
        />
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
            className="h-9 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
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
        description="This sends a real email to every subscribed user with an email on file. This can't be undone or recalled once sending starts."
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
