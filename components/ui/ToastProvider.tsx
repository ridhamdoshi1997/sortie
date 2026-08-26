"use client";

import { Toaster, toast } from "sonner";
import { CheckCircle2, Info, Sparkles, XCircle } from "lucide-react";

// Toast notification system. Was a hand-rolled context+timer implementation
// (build-plan.md §H); replaced 2026-08-25 with Sonner, which was the
// original Phase 23 plan and handles stacking, swipe-to-dismiss, hover-to-
// pause and promise flows properly.
//
// The public API here is UNCHANGED on purpose — `useToast().showToast(msg,
// variant)` still works, so the existing call sites (AddToCompareButton,
// ShareJobLink) needed no edits. Sonner's `toast()` is a plain function and
// needs no provider, but keeping the hook means one toast system instead of
// two coexisting during a migration.
//
// Rendered headless via toast.custom() — see .signal-toast in globals.css
// for why (short version: token-driven styling beats !important-ing over
// Sonner's injected CSS, and it makes the toast follow this app's own .dark
// class without wiring next-themes into the Toaster).
export type ToastVariant = "success" | "error" | "info" | "agent";

const VARIANTS: Record<ToastVariant, { Icon: typeof CheckCircle2; tone: string }> = {
  success: { Icon: CheckCircle2, tone: "text-success" },
  error: { Icon: XCircle, tone: "text-error" },
  info: { Icon: Info, tone: "text-text-muted" },
  // Agent-teal, reserved for AI-authored notifications — same invariant as
  // .ai-hero-card. A plain "saved!" confirmation is NOT an agent toast.
  agent: { Icon: Sparkles, tone: "text-agent" },
};

/**
 * Fire a toast. Callable from any client code — no hook or provider needed.
 * Not callable from a server action: return the result and call this from
 * the client code that receives it.
 */
export function showToast(message: string, variant: ToastVariant = "info"): void {
  const { Icon, tone } = VARIANTS[variant];
  toast.custom(
    (id) => (
      <div
        className={`signal-toast ${variant === "agent" ? "signal-toast-agent" : ""}`}
        role="status"
        onClick={() => toast.dismiss(id)}
      >
        <Icon className={`mt-px h-4 w-4 shrink-0 ${tone}`} />
        <p className="text-[12.5px] leading-snug text-text-secondary">{message}</p>
      </div>
    ),
    { duration: 3000 },
  );
}

export function useToast(): { showToast: typeof showToast } {
  return { showToast };
}

/**
 * Mounted exactly once, at the root layout. A second mounted Toaster
 * duplicates every toast, so never render this per-page.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        // Sonner's own offset default (32px) would sit the stack directly
        // under the Navigator FAB (fixed bottom-6 right-6, 56px tall) — this
        // clears it so a toast never lands on top of the launcher.
        offset={96}
        mobileOffset={16}
        gap={8}
      />
    </>
  );
}
