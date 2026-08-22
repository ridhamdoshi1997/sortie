"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDownCircle, Check, CreditCard, Loader2, PartyPopper } from "lucide-react";

import { createBillingPortalSessionAction, getBillingSummary, getPlansForPricing, type BillingSummary } from "@/actions/billing";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PlanConfig } from "@/lib/subscription";

type PlanAction = "current" | "upgrade" | "downgrade" | "unavailable";

function actionFor(plan: PlanConfig, currentPriceCents: number, isCurrent: boolean): PlanAction {
  if (isCurrent) return "current";
  if (!plan.stripePriceId) return "unavailable";
  return plan.priceCents >= currentPriceCents ? "upgrade" : "downgrade";
}

function PlanCard({
  plan,
  isCurrent,
  action,
  onDowngradeClick,
}: {
  plan: PlanConfig;
  isCurrent: boolean;
  action: PlanAction;
  onDowngradeClick: (plan: PlanConfig) => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-2xl border p-5 transition-colors ${
        isCurrent ? "border-2 border-accent bg-surface" : "border-border bg-surface-secondary opacity-90"
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-secondary">
          {plan.displayName}
        </p>
        {isCurrent && (
          <span className="rounded-full bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
            Current plan
          </span>
        )}
      </div>
      <p className={`mt-2 text-2xl font-bold ${isCurrent ? "text-text-primary" : "text-text-secondary"}`}>
        {plan.priceCents === 0 ? "$0" : `$${(plan.priceCents / 100).toFixed(0)}`}
        {plan.priceCents > 0 && <span className="text-sm font-medium text-text-secondary">/{plan.billingPeriod}</span>}
      </p>
      <ul className="mt-4 flex flex-col gap-2">
        {plan.featureBullets.map((item) => (
          <li key={item} className="flex items-center gap-2 text-xs text-text-secondary">
            <Check className="h-3.5 w-3.5 shrink-0 text-success" />
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-5">
        {action === "current" && (
          <div className="rounded-md border border-border bg-surface-secondary px-3 py-2 text-center text-xs font-medium text-text-muted">
            Your current plan
          </div>
        )}
        {action === "upgrade" && (
          <UpgradeButton
            tier={plan.tier}
            className="w-full rounded-md bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            Upgrade to {plan.displayName}
          </UpgradeButton>
        )}
        {action === "downgrade" && (
          <button
            type="button"
            onClick={() => onDowngradeClick(plan)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-secondary transition-colors hover:bg-surface-secondary"
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            Downgrade to {plan.displayName}
          </button>
        )}
        {action === "unavailable" && (
          <div className="rounded-md border border-border bg-surface-secondary px-3 py-2 text-center text-xs font-medium text-text-muted">
            Not available for checkout yet
          </div>
        )}
      </div>
    </div>
  );
}

// The real "Subscription" tab (was a NotYetAvailable stub — SettingsPanel.tsx
// had a NAV entry reserved for this since before monetization existed).
// Gemini-Pro-style layout, per direct user request: current plan status up
// top with a real manage-billing exit, a full plan comparison grid below
// (current plan highlighted, others grayed) so switching plans doesn't
// require a separate trip to /pricing. Upgrade goes straight to a new
// Stripe Checkout; downgrade routes to the real Stripe Customer Portal
// instead of a custom in-app flow — Stripe's own portal already handles
// cancel-at-period-end (and, once a second paid Price exists, prorated
// plan-swaps) correctly, and duplicating that logic here would just be a
// second, riskier implementation of something Stripe already gets right.
export function SubscriptionTab() {
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<PlanConfig[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portalError, setPortalError] = useState<string | null>(null);
  const [showUpgradedBanner] = useState(
    () => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("upgraded") === "1",
  );
  const [downgradeTarget, setDowngradeTarget] = useState<PlanConfig | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    Promise.all([getBillingSummary(), getPlansForPricing()]).then(([summaryResult, plansResult]) => {
      if (summaryResult.success) {
        setSummary(summaryResult.data);
      } else {
        setError(summaryResult.error);
      }
      setPlans(plansResult);
    });
  }, []);

  // Real success feedback after returning from Stripe Checkout (successUrl
  // in actions/billing.ts is /settings?upgraded=1) — the banner's own
  // visibility is a lazy useState initializer (not a setState-in-effect,
  // avoiding react-hooks/set-state-in-effect for a value already known at
  // mount); this effect only does the actual side effect left (stripping
  // the param so a refresh doesn't replay the banner).
  useEffect(() => {
    if (!showUpgradedBanner) return;
    const params = new URLSearchParams(window.location.search);
    params.delete("upgraded");
    const next = params.toString();
    window.history.replaceState({}, "", next ? `${window.location.pathname}?${next}` : window.location.pathname);
  }, [showUpgradedBanner]);

  function openPortal(): void {
    setPortalError(null);
    startTransition(async () => {
      const result = await createBillingPortalSessionAction();
      if (!result.success) {
        setPortalError(result.error);
        return;
      }
      window.location.assign(result.url);
    });
  }

  if (error) return <p className="text-xs text-error">{error}</p>;

  // Shaped like the real layout below (header line, a button-width bar,
  // two plan-card-height blocks), not a small centered spinner — a
  // generic spinner here caused a real, disclosed height jump when the
  // actual content swapped in (direct user report: "jumping and
  // resizing... very poor loading screen"). Matching the final shape
  // keeps the container's height roughly stable across the swap.
  if (!summary || !plans) {
    return (
      <div className="flex animate-pulse flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="h-5 w-40 rounded bg-surface-secondary" />
          <div className="h-3 w-56 rounded bg-surface-secondary" />
        </div>
        <div className="h-9 w-64 rounded-lg bg-surface-secondary" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="h-72 rounded-2xl border border-border bg-surface-secondary" />
          <div className="h-72 rounded-2xl border border-border bg-surface-secondary" />
        </div>
      </div>
    );
  }

  const currentPlan = plans.find((p) => p.tier === summary.tier);
  const currentPriceCents = currentPlan?.priceCents ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {showUpgradedBanner && (
        <div className="animate-in fade-in-0 zoom-in-95 flex items-center gap-3 rounded-xl border border-success/30 bg-success-lightest px-4 py-3 duration-300">
          <PartyPopper className="h-5 w-5 shrink-0 text-success" />
          <p className="text-sm font-medium text-success-foreground">
            You&apos;re on {summary.displayName} now — everything below reflects it live.
          </p>
        </div>
      )}

      <div>
        <h3 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <CreditCard className="h-4 w-4 text-text-secondary" />
          Subscription
        </h3>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          You&apos;re on {summary.displayName}
          {summary.isPaid && (
            <> — renews {new Date(summary.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</>
          )}
          .
        </p>
      </div>

      {summary.isPaid && (
        <div>
          <button
            type="button"
            onClick={openPortal}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-overlay px-4 py-2.5 text-sm font-medium text-overlay-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4 text-accent" />
            )}
            {isPending ? "Opening…" : "Manage billing, payment method & cancellation"}
          </button>
          {portalError && <p className="mt-2 text-xs text-error">{portalError}</p>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {plans.map((plan) => {
          const isCurrent = plan.tier === summary.tier;
          return (
            <PlanCard
              key={plan.tier}
              plan={plan}
              isCurrent={isCurrent}
              action={actionFor(plan, currentPriceCents, isCurrent)}
              onDowngradeClick={setDowngradeTarget}
            />
          );
        })}
      </div>

      <ConfirmDialog
        open={downgradeTarget !== null}
        title={`Downgrade to ${downgradeTarget?.displayName ?? ""}?`}
        description={`You'll keep ${summary.displayName} access through ${new Date(summary.periodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric" })} — it only switches to ${downgradeTarget?.displayName ?? "the new plan"} after that, no early cutoff. This opens Stripe's billing portal to confirm.`}
        confirmLabel="Continue to billing portal"
        pending={isPending}
        onConfirm={() => {
          setDowngradeTarget(null);
          openPortal();
        }}
        onCancel={() => setDowngradeTarget(null)}
      />
    </div>
  );
}
