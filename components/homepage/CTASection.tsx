import { Check } from "lucide-react";

import { TrackedCtaLink } from "@/components/homepage/TrackedCtaLink";
import { UpgradeButton } from "@/components/billing/UpgradeButton";
import { getPlansForPricing } from "@/actions/billing";
import type { PlanConfig } from "@/lib/subscription";

// Rebuilt for build-plan.md §S, then wired to real live plan data for §J
// (2026-08-21) — the paid tier's price/limits/bullets come from
// subscription_plans (lib/subscription.ts), not a hardcoded stub, so an
// admin edit from /admin/billing reflects here immediately. Free tier's
// bullet list stays hand-written (it's a marketing summary of the whole
// free product, not a 1:1 mirror of subscription_plans' recon row, which
// only tracks the two premium-API limits + eval cap, not everything free).
const FREE_INCLUDES = [
  "10-dimension job evaluation",
  "ATS-safe résumé tailoring",
  "Application tracking",
  "Interview prep tools",
];

// Renders every real paid plan (not just the first one) — Vanguard's
// $149-lifetime-deal addition (direct user request) made the old
// "grab the one paid plan" shape stale; a plan an owner adds from
// /admin/billing now just shows up here without touching this component
// again. Vanguard-style scarcity-capped plans get a progress bar and lock
// into a real "Sold out" state instead of a checkout button once claimed.
function PaidPlanCard({ plan }: { plan: PlanConfig }) {
  const isLifetime = plan.billingPeriod === "lifetime";
  const isSoldOut = plan.maxSeats !== null && plan.seatsClaimed >= plan.maxSeats;

  return (
    // flex h-full flex-col, content wrapped in flex-1 below — direct user
    // report that the three pricing buttons didn't line up: each card was
    // sized to its own content (Vanguard has 3 more bullets than Free), and
    // a grid's default `align-items: stretch` only equalizes the CARDS'
    // height, not where a button sits inside one once its own content is
    // shorter than a sibling's. h-full pulls each card up to the row's
    // real height; wrapping everything above the button in `flex-1` lets
    // THAT div absorb the leftover space instead of the button itself, so
    // the button keeps a real, constant mt-8 gap above it on every card
    // (including the tallest one, which has zero leftover space) while
    // still landing at the same Y position across all three — a bare
    // `mt-auto` on the button would have resolved to 0 on the tallest
    // card, losing that breathing room there specifically.
    <div className="fade-in-up card-interactive-glow flex h-full flex-col rounded-2xl border border-border bg-surface p-8 shadow-card" style={{ animationDelay: "60ms" }}>
      <div className="flex-1">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-agent">{plan.displayName}</p>
        <p className="mt-2 text-3xl font-bold text-text-primary">
          ${(plan.priceCents / 100).toFixed(0)}
          <span className="text-base font-medium text-text-secondary">{isLifetime ? " once" : `/${plan.billingPeriod}`}</span>
        </p>
        <p className="mt-1 text-sm text-text-secondary">
          {isLifetime
            ? "Pay once, keep it forever — limited seats."
            : "For a heavy, ongoing search that needs the deeper research tools."}
        </p>
        {plan.maxSeats !== null && (
          <div className="mt-4">
            {/* transform-based fill, not `width` — same real layout-thrash
               fix already applied to the dashboard funnel and Settings' own
               seat meter (this instance was missed in that earlier pass). */}
            <div className="signal-meter-track w-full">
              <div
                className="signal-meter-fill signal-fill-in"
                style={{ "--fill": Math.min(1, plan.seatsClaimed / Math.max(1, plan.maxSeats)) } as React.CSSProperties}
              />
            </div>
            <p className="mt-1.5 text-[11px] font-medium text-text-muted">
              {plan.seatsClaimed} / {plan.maxSeats} seats claimed
            </p>
          </div>
        )}
        <ul className="mt-6 flex flex-col gap-2.5 text-left">
          {plan.featureBullets.map((item) => (
            <li key={item} className="flex items-center gap-2 text-sm text-text-secondary">
              <Check className="h-4 w-4 shrink-0 text-success" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      {isSoldOut ? (
        <div className="mt-8 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-border bg-surface-secondary px-6 text-sm font-semibold text-text-muted">
          Sold out — all {plan.maxSeats} seats claimed
        </div>
      ) : plan.stripePriceId ? (
        <UpgradeButton
          tier={plan.tier}
          className="btn-signal mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-accent-foreground disabled:opacity-60"
        >
          {isLifetime ? `Buy ${plan.displayName} — one-time` : `Upgrade to ${plan.displayName}`}
        </UpgradeButton>
      ) : (
        <button
          type="button"
          disabled
          className="mt-8 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-text-muted"
        >
          Not yet available
        </button>
      )}
    </div>
  );
}

export async function CTASection() {
  const plans = await getPlansForPricing();
  const paidPlans = plans.filter((p) => p.priceCents > 0);

  return (
    <section id="pricing" className="px-4 pb-16 sm:px-6 sm:pb-20 lg:px-8">
      <div className={paidPlans.length > 1 ? "mx-auto max-w-6xl" : "mx-auto max-w-4xl"}>
        <div className="mb-10 text-center">
          <h2 className="text-[clamp(2rem,4.5vw,3rem)] font-semibold leading-[1.02] tracking-[-0.03em] text-text-primary">
            Free to start. No unattended applications, ever.
          </h2>
        </div>

        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${paidPlans.length > 1 ? "lg:grid-cols-3" : ""}`}>
          <div className="fade-in-up card-interactive-glow flex h-full flex-col rounded-2xl border-2 border-accent bg-surface p-8 shadow-card">
            <div className="flex-1">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-accent">Free</p>
              <p className="mt-2 text-3xl font-bold text-text-primary">$0</p>
              <p className="mt-1 text-sm text-text-secondary">Everything you need to run a real search today.</p>
              <ul className="mt-6 flex flex-col gap-2.5 text-left">
                {FREE_INCLUDES.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-sm text-text-secondary">
                    <Check className="h-4 w-4 shrink-0 text-success" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <TrackedCtaLink
              href="/login"
              eventName="marketing_cta_clicked"
              eventProperties={{ location: "pricing" }}
              className="btn-signal mt-8 inline-flex min-h-11 w-full items-center justify-center rounded-md px-6 text-sm font-semibold text-accent-foreground"
            >
              Start for free
            </TrackedCtaLink>
          </div>

          {paidPlans.length > 0 ? (
            paidPlans.map((plan) => <PaidPlanCard key={plan.tier} plan={plan} />)
          ) : (
            <div className="flex h-full flex-col rounded-2xl border border-border bg-surface-tertiary p-8 opacity-70">
              <div className="flex-1">
                <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-text-muted">
                  Pro — Coming soon
                </p>
                <p className="mt-2 text-3xl font-bold text-text-muted">&mdash;</p>
                <p className="mt-1 text-sm text-text-muted">
                  Higher usage limits and deeper research tools for a heavy, ongoing search.
                </p>
              </div>
              <button
                type="button"
                disabled
                className="mt-8 inline-flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-md border border-border bg-surface px-6 text-sm font-medium text-text-muted"
              >
                Not yet available
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
