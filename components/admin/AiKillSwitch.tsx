"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, PowerOff, Zap } from "lucide-react";

import { setAiEnabled } from "@/actions/admin";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { AppSettings } from "@/lib/admin/queries";

// The global kill switch — a v1.1 addition agy flagged as genuinely
// missing from the original v1 plan: per-user suspension is reactive, but
// a runaway bug or bot-spam burst needs a way to stop every AI call
// app-wide in one click, not suspend hundreds of users one at a time.
// Deliberately has NO exceptions when off — see lib/usage.ts's
// checkAndConsumeUsage comment.
export function AiKillSwitch({ initialSettings }: { initialSettings: AppSettings }) {
  const [settings, setSettings] = useState(initialSettings);
  const [reason, setReason] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function apply(enabled: boolean): void {
    setError(null);
    startTransition(async () => {
      const result = await setAiEnabled(enabled, reason);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setSettings({ aiEnabled: enabled, aiDisabledReason: enabled ? null : reason || null });
      setConfirmingDisable(false);
      setReason("");
    });
  }

  return (
    <div
      className={`rounded-2xl border p-6 shadow-card ${
        settings.aiEnabled ? "border-border bg-surface" : "border-error/30 bg-error/5"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full ${
              settings.aiEnabled ? "bg-surface-secondary text-text-secondary" : "bg-error/10 text-error"
            }`}
          >
            {settings.aiEnabled ? <Zap className="h-4 w-4" /> : <PowerOff className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-text-primary">
              AI features are {settings.aiEnabled ? "on" : "OFF — every account is blocked"}
            </p>
            {!settings.aiEnabled && settings.aiDisabledReason && (
              <p className="mt-0.5 text-xs text-error">{settings.aiDisabledReason}</p>
            )}
          </div>
        </div>

        {settings.aiEnabled ? (
          <button
            type="button"
            onClick={() => setConfirmingDisable(true)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-error/30 px-3 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:opacity-60"
          >
            <AlertTriangle className="h-3 w-3" />
            Disable AI app-wide
          </button>
        ) : (
          <button
            type="button"
            onClick={() => apply(true)}
            disabled={isPending}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Re-enable AI
          </button>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-error">{error}</p>}

      <ConfirmDialog
        open={confirmingDisable}
        title="Disable AI features for every user?"
        description="No account — including your own — will be able to run any AI-costing action until you turn this back on. Use this for a runaway-cost incident, not a single-user problem (suspend that user instead)."
        confirmLabel="Disable"
        pending={isPending}
        onConfirm={() => apply(false)}
        onCancel={() => setConfirmingDisable(false)}
      />

      {confirmingDisable && (
        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-medium text-text-muted">Reason (shown to blocked users)</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Investigating unusual usage — back shortly"
            className="h-9 w-full max-w-md rounded-md border border-border bg-surface px-3 text-sm text-text-primary outline-none focus-visible:border-accent"
          />
        </div>
      )}
    </div>
  );
}
