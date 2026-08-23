"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { getPlan, getPremiumFeatureStatus, getUserSubscription, listPlans, type PlanConfig } from "@/lib/subscription";
import { getSiteUrl } from "@/lib/siteUrl";
import { toUserMessage } from "@/lib/errors";

type ActionResult = { success: true; url: string } | { success: false; error: string };

export type BillingSummary = {
  tier: string;
  displayName: string;
  isPaid: boolean;
  hasCheckout: boolean;
  // Lifetime plans (Vanguard) have no recurring Stripe subscription behind
  // them — Settings' billing section uses this to skip the "manage
  // billing/cancellation" portal button, which has nothing to manage.
  billingPeriod: "month" | "year" | "lifetime";
  periodEnd: string;
  insiderConnections: { limit: number; used: number };
  companyResearch: { limit: number; used: number };
};

// Settings' billing section — current plan + real premium-feature usage
// against it, so a user sees this coming instead of just hitting a wall.
export async function getBillingSummary(): Promise<{ success: true; data: BillingSummary } | { success: false; error: string }> {
  // requireUser must be outside try/catch — redirect() throws NEXT_REDIRECT
  // which would otherwise be caught and swallowed as a generic error.
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const [subscription, insiderConnections, companyResearch] = await Promise.all([
      getUserSubscription(insforge, user.id, user.email),
      getPremiumFeatureStatus(insforge, user.id, user.email, "insider_connections"),
      getPremiumFeatureStatus(insforge, user.id, user.email, "company_research"),
    ]);

    return {
      success: true,
      data: {
        tier: subscription.tier,
        displayName: subscription.plan.displayName,
        isPaid: subscription.plan.priceCents > 0,
        hasCheckout: subscription.plan.stripePriceId !== null,
        billingPeriod: subscription.plan.billingPeriod,
        periodEnd: subscription.periodEnd.toISOString(),
        insiderConnections: { limit: insiderConnections.limit, used: insiderConnections.used },
        companyResearch: { limit: companyResearch.limit, used: companyResearch.used },
      },
    };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to load billing info.") };
  }
}

// Public plan list for /pricing — no admin gate, this is marketing content.
// Wraps lib/subscription.ts's listPlans() with the user's own cookie-scoped
// client (subscription_plans has an "anyone can view" RLS policy, so this
// works for logged-out visitors too).
export async function getPlansForPricing(): Promise<PlanConfig[]> {
  const insforge = await createInsforgeServer();
  return listPlans(insforge);
}

// requireUser() redirects an unauthenticated caller to /login itself
// (lib/auth.ts) — no separate "are they logged in" branch needed here; a
// logged-out visitor clicking "Upgrade" just lands on /login, same as any
// other gated action in this app.
export async function createCheckoutSessionAction(tier: string): Promise<ActionResult> {
  // requireUser must be outside try/catch — redirect() throws NEXT_REDIRECT
  // which would otherwise be caught and swallowed as a generic error.
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const plan = await getPlan(insforge, tier);
    if (!plan.stripePriceId) {
      return { success: false, error: "This plan isn't available for checkout yet." };
    }

    // Fast, best-effort pre-check for scarcity-capped plans (Vanguard) —
    // real race-safety happens at fulfillment via claim_plan_seat's atomic
    // row-locked UPDATE (see the add-vanguard-lifetime-tier migration);
    // this just saves someone a trip through Stripe Checkout for a seat
    // that's already gone, it can't fully close the race between two
    // people both starting checkout in the same instant.
    if (plan.maxSeats !== null && plan.seatsClaimed >= plan.maxSeats) {
      return { success: false, error: `${plan.displayName} is sold out — all ${plan.maxSeats} seats have been claimed.` };
    }

    const siteUrl = getSiteUrl();
    const isOneTime = plan.billingPeriod === "lifetime";
    const { data, error } = await insforge.payments.stripe.createCheckoutSession("test", {
      mode: isOneTime ? "payment" : "subscription",
      lineItems: [{ priceId: plan.stripePriceId, quantity: 1 }],
      successUrl: `${siteUrl}/settings?upgraded=1`,
      cancelUrl: `${siteUrl}/pricing`,
      subject: { type: "user", id: user.id },
      customerEmail: user.email ?? null,
      // Stamped so fulfill_stripe_one_time_purchase() can resolve which
      // plan a one-time Checkout Session was for — a Checkout Session
      // webhook payload carries no line-item/price array to reverse-map
      // the way an invoice does (see the migration's own comment). Harmless
      // to also send on a subscription checkout, just unused there.
      metadata: { plan_tier: tier },
      idempotencyKey: `user:${user.id}:${tier}:${Date.now()}`,
    });

    if (error || !data?.checkoutSession.url) {
      console.error("[actions/billing] createCheckoutSessionAction", error);
      return { success: false, error: toUserMessage(error, "Failed to start checkout — try again.") };
    }

    return { success: true, url: data.checkoutSession.url };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to start checkout — try again.") };
  }
}

// Existing paying customers only — portal creation needs a real
// payments.customer_mappings row (skills/insforge/payments/stripe.md), which
// only exists after at least one completed checkout. Surfaced from Settings'
// billing section, gated on the user actually being on a paid plan.
export async function createBillingPortalSessionAction(): Promise<ActionResult> {
  // requireUser must be outside try/catch — redirect() throws NEXT_REDIRECT
  // which would otherwise be caught and swallowed as a generic error.
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data, error } = await insforge.payments.stripe.createCustomerPortalSession("test", {
      subject: { type: "user", id: user.id },
      returnUrl: `${getSiteUrl()}/settings`,
    });

    if (error || !data?.customerPortalSession.url) {
      console.error("[actions/billing] createBillingPortalSessionAction", error);
      return { success: false, error: "No billing account found yet — subscribe first." };
    }

    return { success: true, url: data.customerPortalSession.url };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to open billing portal — try again.") };
  }
}
