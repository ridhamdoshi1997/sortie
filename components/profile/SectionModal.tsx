"use client";

import { X } from "lucide-react";

// Centered glass-chrome dialog, mirroring SettingsModal's chrome
// (components/settings/SettingsModal.tsx) plus an entrance animation via
// tw-animate-css (already a real dependency, see app/globals.css's
// `@import "tw-animate-css"`) — ported from the /preview/profile design
// pass rather than inventing a second modal pattern for the app.
export function SectionModal({
  title,
  onClose,
  onSave,
  saving,
  children,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  saving?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 glass-panel-strong flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-bold text-text-primary">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">{children}</div>
        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Circular icon badge — same treatment across every section header
// (Personal's avatar and every tab heading) so nothing reads like an
// afterthought next to the others.
export function SectionIcon({
  icon: Icon,
  size = "md",
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  size?: "md" | "lg";
}) {
  const dims = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const iconDims = size === "lg" ? "h-7 w-7" : "h-5 w-5";
  return (
    <span className={`flex ${dims} shrink-0 items-center justify-center rounded-full bg-accent-muted text-accent`}>
      <Icon className={iconDims} strokeWidth={1.75} />
    </span>
  );
}
