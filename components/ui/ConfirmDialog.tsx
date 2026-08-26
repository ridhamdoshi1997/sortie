"use client";

import { useEffect } from "react";
import { Check, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * "danger" (default) keeps the destructive error-red confirm — this
   * dialog's original and still most common job (deleting an
   * accomplishment, a STAR story, an account). "neutral" is the mockup's
   * amber treatment, for a reversible action like marking a job
   * unavailable. Deliberately NOT one shared amber style: making
   * "Permanently delete" look like a friendly primary action would be a
   * real regression, not a restyle.
   */
  tone?: "danger" | "neutral";
  /**
   * Small uppercase eyebrow above the title. The mockup shows an
   * agent-teal "AI Navigator reads" here, but that label is only honest on
   * a dialog that actually presents AI output — on a delete confirm it
   * would be false, and it would break the app-wide rule that agent-teal
   * means AI-generated content. So it's a prop with a neutral default;
   * pass "AI Navigator reads" only where that's genuinely true.
   */
  eyebrow?: string;
  pending?: boolean;
  /** Inline failure from a previous confirm attempt — rendered between the
   * description and the action row, so a caller doesn't need to smuggle its
   * own error text into a sibling element outside this portal-free dialog. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
};

// Reusable confirmation dialog — replaces the browser's own window.confirm()
// ("localhost:3001 says…", unstyleable) with this app's chrome. Restyled to
// the Signal mockup's modal (2026-08-25): scrim blur-in, card lift-in,
// display-serif title, right-aligned action row.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  tone = "danger",
  eyebrow = "Confirm",
  pending,
  error,
  onConfirm,
  onCancel,
}: Props) {
  // Escape closes it. The previous version only supported click-outside,
  // which left keyboard users with no way out of a modal.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pending, onCancel]);

  if (!open) return null;

  const isDanger = tone === "danger";

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-[4px] duration-200"
      onClick={() => !pending && onCancel()}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 signal-modal-card w-full max-w-sm rounded-[18px] border border-border bg-surface p-6 duration-[260ms] ease-out"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        {eyebrow && (
          <p
            className={`mb-3 flex items-center gap-1.5 font-mono text-[10.5px] font-bold uppercase tracking-[0.08em] ${
              isDanger ? "text-error" : "text-agent-dark"
            }`}
          >
            <span
              className={`inline-block h-[5px] w-[5px] rounded-full ${
                isDanger ? "bg-error" : "bg-agent"
              }`}
            />
            {eyebrow}
          </p>
        )}

        <h2 className="font-display text-[17px] font-semibold leading-snug text-text-primary">
          {title}
        </h2>
        <p className="mt-2 text-[12.5px] leading-6 text-text-secondary">{description}</p>
        {error && (
          <p className="mt-3 text-[12px] font-medium leading-5 text-error" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={
              isDanger
                ? "inline-flex items-center gap-2 rounded-xl bg-error px-4 py-2 text-sm font-medium text-error-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                : "btn-signal inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-60"
            }
          >
            {confirmLabel}
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              !isDanger && (
                <span className="btn-signal-icon">
                  <Check className="h-3 w-3" />
                </span>
              )
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
