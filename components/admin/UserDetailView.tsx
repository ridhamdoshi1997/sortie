"use client";

import { useState, useTransition } from "react";
import { ShieldOff, StickyNote } from "lucide-react";

import { addAdminNote, setUsageMultiplier, setUserSuspended } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TrendChart } from "@/components/admin/TrendChart";
import type { AdminNoteRow, UserDetail } from "@/lib/admin/queries";

// Real hydration-mismatch bug caught live: `toLocaleString(undefined, ...)`
// with a 12-hour clock renders "9:12 PM" server-side (Node) vs "9:12 p.m."
// client-side (browser) — a genuine ICU divergence in AM/PM formatting
// between environments, not a locale the caller controls. Pinning "en-US"
// explicitly does NOT fix this specific divergence; only removing the
// hour12 dayPeriod token does, so this uses a 24-hour clock instead — an
// internal admin tool doesn't need 12-hour formatting anyway.
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// The "God-Mode Read-Only View" from build-plan.md §R's original spec,
// v1.1 fast-follow — Overview/Usage/Notes in one page rather than the
// original spec's separate tabs (not enough distinct content yet per
// section to justify tab chrome; add tabs if Documents/Career sections get
// built out later).
export function UserDetailView({
  detail: initialDetail,
  notes: initialNotes,
}: {
  detail: UserDetail;
  notes: AdminNoteRow[];
}) {
  const [detail, setDetail] = useState(initialDetail);
  const [notes, setNotes] = useState(initialNotes);
  const [multiplierInput, setMultiplierInput] = useState(String(initialDetail.customUsageMultiplier));
  const [noteInput, setNoteInput] = useState("");
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function toggleSuspend(suspend: boolean): void {
    setError(null);
    startTransition(async () => {
      const result = await setUserSuspended(detail.userId, suspend);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDetail((prev) => ({ ...prev, isSuspended: suspend }));
      setConfirmingSuspend(false);
    });
  }

  function saveMultiplier(): void {
    const value = Number(multiplierInput);
    if (!Number.isFinite(value) || value < 0) {
      setError("Enter a valid non-negative number.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setUsageMultiplier(detail.userId, value);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setDetail((prev) => ({ ...prev, customUsageMultiplier: value }));
    });
  }

  function submitNote(): void {
    if (!noteInput.trim()) return;
    setError(null);
    startTransition(async () => {
      const result = await addAdminNote(detail.userId, noteInput);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setNotes((prev) => [{ id: crypto.randomUUID(), note: noteInput.trim(), createdAt: new Date().toISOString(), adminEmail: null }, ...prev]);
      setNoteInput("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-xs text-error">{error}</p>}

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-text-primary">{detail.fullName ?? detail.email ?? detail.userId}</h1>
            <p className="text-sm text-text-secondary">{detail.email}</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
              {detail.currentTitle && <span>{detail.currentTitle}</span>}
              {detail.location && <span>{detail.location}</span>}
              {detail.createdAt && <span>Joined {formatDateTime(detail.createdAt)}</span>}
              <span>{detail.jobCount} tracked jobs</span>
            </div>
          </div>

          {detail.isSuspended ? (
            <span className="rounded-full bg-error/10 px-3 py-1.5 text-xs font-medium text-error">Suspended</span>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingSuspend(true)}
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
            >
              <ShieldOff className="h-3 w-3" />
              Suspend
            </button>
          )}
          {detail.isSuspended && (
            <button
              type="button"
              onClick={() => toggleSuspend(false)}
              disabled={isPending}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
            >
              Unsuspend
            </button>
          )}
        </div>

        <div className="mt-5 flex items-end gap-2 border-t border-border pt-4">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-text-muted">Usage multiplier</label>
            <input
              type="number"
              min="0"
              step="0.1"
              value={multiplierInput}
              onChange={(e) => setMultiplierInput(e.target.value)}
              className="h-9 w-24 rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={saveMultiplier}
            disabled={isPending || multiplierInput === String(detail.customUsageMultiplier)}
            className="h-9 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Save
          </button>
          <p className="pb-2 text-xs text-text-muted">
            Scales every daily action cap for this user (1 = normal, 0.5 = half, 2 = double).
          </p>
        </div>
      </div>

      <TrendChart title="AI usage (14 days)" data={detail.usageLast14Days} colorVar="var(--color-info)" />

      <div className="border border-border bg-surface shadow-card rounded-2xl p-6">
        <div className="mb-3 flex items-center gap-2">
          <StickyNote className="h-4 w-4 text-text-secondary" />
          <h2 className="text-base font-semibold text-text-primary">Admin notes</h2>
        </div>

        <div className="mb-4 flex items-end gap-2">
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Leave a note for other admins..."
            rows={2}
            className="flex-1 rounded-md border border-border bg-surface-secondary px-3 py-2 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={submitNote}
            disabled={isPending || !noteInput.trim()}
            className="h-9 rounded-md bg-accent px-3 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Add
          </button>
        </div>

        {notes.length === 0 ? (
          <p className="text-sm text-text-muted">No notes yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border bg-surface-secondary p-3.5">
                <p className="text-sm leading-6 text-text-primary">{n.note}</p>
                <p className="mt-1 text-xs text-text-muted">
                  {n.adminEmail ?? "Admin"} · {formatDateTime(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmingSuspend}
        title="Suspend this user?"
        description={`${detail.email ?? "This user"} will be blocked from every AI-costing action immediately. You can unsuspend them any time.`}
        confirmLabel="Suspend"
        pending={isPending}
        onConfirm={() => toggleSuspend(true)}
        onCancel={() => setConfirmingSuspend(false)}
      />
    </div>
  );
}
