"use client";

import { useState, useTransition } from "react";
import { BellRing } from "lucide-react";

import { sendPushBroadcast } from "@/actions/adminPush";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AdminRole } from "@/lib/admin/auth";

// The second Marketing broadcast channel (push, paired with email) — a
// send-immediately form, no draft/edit cycle (see actions/adminPush.ts's
// own comment for why). Genuinely usable today, unlike email — no
// external account or domain needed for Web Push.
export function PushBroadcastForm({ subscriberCount, viewerRole }: { subscriberCount: number; viewerRole: AdminRole }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [isPending, startTransition] = useTransition();

  const canWrite = viewerRole === "owner" || viewerRole === "admin";

  function handleSend(): void {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await sendPushBroadcast(title, body, url);
      setConfirmSend(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotice("Sending — subscribers will receive it within a few seconds.");
      setTitle("");
      setBody("");
      setUrl("");
    });
  }

  return (
    <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
      <div className="mb-1 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-text-secondary" />
        <h2 className="text-base font-semibold text-text-primary">Push notifications</h2>
      </div>
      <p className="mb-4 text-xs text-text-muted">{subscriberCount} subscribed device{subscriberCount === 1 ? "" : "s"}. Sends immediately, no draft.</p>

      {error && <p className="mb-2 text-xs text-error">{error}</p>}
      {notice && <p className="mb-2 text-xs text-success">{notice}</p>}

      {canWrite ? (
        <div className="flex flex-col gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message"
            rows={2}
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Link when clicked (optional, e.g. /career)"
            className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={() => setConfirmSend(true)}
            disabled={isPending || !title.trim() || !body.trim()}
            className="h-9 w-fit rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Send to {subscriberCount} subscribers
          </button>
        </div>
      ) : (
        <p className="text-sm text-text-muted">Only owner/admin can send push broadcasts.</p>
      )}

      <ConfirmDialog
        open={confirmSend}
        title={`Send to ${subscriberCount} subscribers?`}
        description="This sends a real push notification immediately to every subscribed device. This can't be recalled."
        confirmLabel="Send"
        pending={isPending}
        onConfirm={handleSend}
        onCancel={() => setConfirmSend(false)}
      />
    </div>
  );
}
