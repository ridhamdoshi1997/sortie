"use client";

import { AlertTriangle, Loader2 } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

// Reusable destructive-action confirmation — replaces the browser's own
// window.confirm() dialog ("localhost:3001 says…", unstyleable, reads as
// unfinished/unprofessional) with this app's own chrome. Same glass-modal
// recipe as SectionModal.tsx (bg-black/40 + backdrop-blur scrim,
// glass-panel-strong card, tw-animate-css entrance) so it feels like part
// of the app rather than a second pattern.
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  pending,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 glass-panel-strong w-full max-w-sm rounded-2xl p-6 duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error/10 text-error">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="flex-1 pt-1">
            <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
            <p className="mt-1 text-sm leading-5 text-text-secondary">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-error px-4 py-2 text-sm font-medium text-error-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
