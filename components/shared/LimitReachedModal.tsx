"use client";

import Link from "next/link";
import { Lock, TrendingUp, X } from "lucide-react";

// Generic circuit-breaker upsell/limit modal — same centered glass-chrome
// recipe as components/profile/SectionModal.tsx, but with a footer this
// app's other modal can't express (an upgrade CTA and a dismiss, not a
// Cancel/Save pair), so it's its own component rather than a fork.
//
// Two distinct blocked states, per lib/subscription.ts's CircuitBreakerResult:
// - "upgrade_required": a free-plan user hit a feature with a zero
//   allowance — the CTA is "upgrade."
// - "monthly_cap_reached": a paid-plan user used up this billing period's
//   allowance — the CTA is just "got it," with a concrete reset date, no
//   further upsell (they're already paying for this feature).
export type LimitReachedReason = "upgrade_required" | "monthly_cap_reached";

type Props = {
  reason: LimitReachedReason;
  featureLabel: string;
  message: string;
  resetsAt?: string;
  onClose: () => void;
};

export function LimitReachedModal({ reason, featureLabel, message, resetsAt, onClose }: Props) {
  const isUpgrade = reason === "upgrade_required";

  return (
    <div
      className="animate-in fade-in-0 fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm duration-200"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-2 glass-panel-strong flex w-full max-w-md flex-col overflow-hidden rounded-2xl duration-200 ease-out"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={isUpgrade ? `Upgrade to unlock ${featureLabel}` : `Monthly limit reached for ${featureLabel}`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isUpgrade ? "bg-accent-muted text-accent" : "bg-surface-secondary text-text-secondary"
              }`}
            >
              {isUpgrade ? <TrendingUp className="h-4.5 w-4.5" /> : <Lock className="h-4.5 w-4.5" />}
            </span>
            <h2 className="text-base font-bold text-text-primary">
              {isUpgrade ? "Upgrade to Command" : "Monthly limit reached"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-secondary hover:text-text-primary"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-6">
          <p className="text-sm leading-6 text-text-primary">{message}</p>
          {!isUpgrade && resetsAt && (
            <p className="text-xs font-medium text-text-muted">
              Resets{" "}
              {new Date(resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            {isUpgrade ? "Maybe later" : "Got it"}
          </button>
          {isUpgrade && (
            <Link
              href="/pricing"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              See Command plan
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
