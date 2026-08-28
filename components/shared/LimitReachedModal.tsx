"use client";

import Link from "next/link";
import { Lock, TrendingUp, X } from "lucide-react";

// Generic circuit-breaker upsell/limit modal — same centered glass-chrome
// recipe as components/profile/SectionModal.tsx, but with a footer this
// app's other modal can't express (an upgrade CTA and a dismiss, not a
// Cancel/Save pair), so it's its own component rather than a fork.
//
// Three distinct blocked states now (extended 2026-08-28 to cover
// lib/usage.ts's own daily-limit system, not just lib/subscription.ts's
// monthly one — same modal, not a second component, since the three states
// only ever differ in period wording and whether an upgrade CTA applies):
// - "upgrade_required": a free-plan user hit a feature with a zero
//   allowance — always shows the upgrade CTA.
// - "monthly_cap_reached" / "daily_cap_reached": a paid-plan user used up
//   this period's allowance. Used to always mean "nothing higher to offer"
//   (paying users already at the top), but that stopped being true once a
//   tier above Command (Ace) existed — a Command user CAN still benefit
//   from upgrading on some features. `canUpgrade` (computed server-side by
//   comparing every real plan's limit for this specific action/feature,
//   not assumed) decides whether the CTA shows for these two states.
export type LimitReachedReason = "upgrade_required" | "monthly_cap_reached" | "daily_cap_reached";

type Props = {
  reason: LimitReachedReason;
  featureLabel: string;
  message: string;
  resetsAt?: string;
  // Only meaningful for monthly_cap_reached/daily_cap_reached —
  // upgrade_required always shows the CTA regardless of this prop.
  canUpgrade?: boolean;
  onClose: () => void;
};

export function LimitReachedModal({ reason, featureLabel, message, resetsAt, canUpgrade = false, onClose }: Props) {
  const isUpgradeRequired = reason === "upgrade_required";
  const isDaily = reason === "daily_cap_reached";
  const showUpgradeCta = isUpgradeRequired || canUpgrade;
  const heading = isUpgradeRequired ? "Upgrade to unlock this" : isDaily ? "Daily limit reached" : "Monthly limit reached";

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
        aria-label={isUpgradeRequired ? `Upgrade to unlock ${featureLabel}` : `${heading} for ${featureLabel}`}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                showUpgradeCta ? "bg-accent/15 text-accent" : "bg-surface-secondary text-text-secondary"
              }`}
            >
              {showUpgradeCta ? <TrendingUp className="h-4.5 w-4.5" /> : <Lock className="h-4.5 w-4.5" />}
            </span>
            <h2 className="text-base font-bold text-text-primary">{heading}</h2>
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
          {!isUpgradeRequired && resetsAt && (
            <p className="text-xs font-medium text-text-muted">
              Resets {isDaily ? "tomorrow" : new Date(resetsAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            {showUpgradeCta ? "Maybe later" : "Got it"}
          </button>
          {showUpgradeCta && (
            <Link
              href="/pricing"
              className="btn-signal rounded-lg px-4 py-2 text-sm font-medium text-accent-foreground"
            >
              See plans
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
