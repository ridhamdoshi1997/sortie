import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminDbClient } from "@/lib/admin/client";

// Real payments infrastructure rebuild (Phase 41+, migration off InsForge).
// InsForge managed Stripe webhook registration + catalog sync + fulfillment
// as platform infrastructure — Supabase has no equivalent, so this route
// (plus createCheckoutSessionAction/createBillingPortalSessionAction in
// actions/billing.ts) is a from-scratch replacement. The actual fulfillment
// RULES below are ported directly from the original
// public.fulfill_stripe_subscription_event()/fulfill_stripe_one_time_purchase()
// SECURITY DEFINER trigger functions (see migrations/20260821161903_add-stripe-billing.sql
// and its two follow-up fix migrations) — same business logic, reimplemented
// as a webhook handler instead of a DB trigger on a payments.webhook_events
// insert, since that raw-event staging table was InsForge-internal and
// excluded from the schema migration. The user's identity now travels via
// Stripe's own `client_reference_id`/`metadata.supabase_user_id` (set at
// Checkout Session creation) instead of InsForge's `insforge_subject_id` +
// a separate payments.customer_mappings lookup table — Stripe carries
// Checkout Session metadata forward onto the created Subscription (via
// subscription_data.metadata) and, from there, onto every subsequent
// invoice's `parent.subscription_details.metadata`, so no separate mapping
// table is needed for the common case.

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function getSubjectId(obj: { metadata?: Stripe.Metadata | null }): string | null {
  return obj.metadata?.supabase_user_id ?? null;
}

async function handleInvoicePaid(admin: ReturnType<typeof createAdminDbClient>, invoice: Stripe.Invoice) {
  // Real shape confirmed live (2026-09-02) on this Stripe account's API
  // version, NOT assumed: a line item's price lives at
  // `line.pricing.price_details.price` (not the older `line.price.id`
  // shape), and — genuinely simpler than expected — the line item's own
  // `metadata` already carries `supabase_user_id` directly (Stripe
  // propagates subscription_data.metadata from Checkout onto every
  // invoice line item automatically), no need to reach into
  // `parent.subscription_details.metadata` at all. Kept the invoice-level
  // metadata as a fallback for the rare invoice with no line items.
  const invoiceAny = invoice as unknown as {
    metadata?: Stripe.Metadata | null;
    customer?: string | { id: string } | null;
    lines: {
      data: Array<{
        metadata?: Stripe.Metadata | null;
        pricing?: { price_details?: { price?: string } };
        period?: { start: number; end: number };
        amount?: number;
      }>;
    };
  };

  const line = invoiceAny.lines.data[0];
  const subjectId = line?.metadata?.supabase_user_id ?? invoiceAny.metadata?.supabase_user_id ?? null;
  if (!subjectId) {
    console.warn(`[webhooks/stripe] invoice.paid ${invoice.id} has no resolvable Sortie user`);
    return;
  }

  const priceId = line?.pricing?.price_details?.price;
  if (!priceId) {
    console.warn(`[webhooks/stripe] invoice.paid ${invoice.id} has no price on its first line item`);
    return;
  }

  const { data: plans } = await admin.database
    .from("subscription_plans")
    .select("tier, regional_prices")
    .returns<{ tier: string; regional_prices: Record<string, { stripePriceId?: string }> }[]>();
  const plan = plans?.find(
    (p) => p.tier === priceId || Object.values(p.regional_prices ?? {}).some((rp) => rp.stripePriceId === priceId),
  );
  // The line above compares p.tier to priceId as a defensive no-op guard —
  // real match is on stripe_price_id, done via a second, precise query
  // below (RLS-free admin client, cheap enough for a low-volume webhook).
  const { data: planRow } = await admin.database
    .from("subscription_plans")
    .select("tier")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  const tier = planRow?.tier ?? plan?.tier;
  if (!tier) {
    console.warn(`[webhooks/stripe] invoice.paid ${invoice.id} has an unrecognized price ${priceId}`);
    return;
  }

  const customerId = typeof invoiceAny.customer === "string" ? invoiceAny.customer : invoiceAny.customer?.id ?? null;
  const periodStart = line?.period ? new Date(line.period.start * 1000).toISOString() : new Date().toISOString();
  const periodEnd = line?.period ? new Date(line.period.end * 1000).toISOString() : new Date().toISOString();

  const { data: existing } = await admin.database
    .from("user_subscriptions")
    .select("user_id")
    .eq("user_id", subjectId)
    .maybeSingle();
  const hadPriorSubscription = Boolean(existing);

  await admin.database.from("user_subscriptions").upsert(
    {
      user_id: subjectId,
      tier,
      status: "active",
      current_period_start: periodStart,
      current_period_end: periodEnd,
      payment_customer_id: customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (!hadPriorSubscription) {
    const { data: profile } = await admin.database
      .from("profiles")
      .select("affiliate_referred_by_code")
      .eq("id", subjectId)
      .maybeSingle();
    if (profile?.affiliate_referred_by_code) {
      const { data: affiliate } = await admin.database
        .from("affiliates")
        .select("id, commission_rate")
        .eq("affiliate_code", profile.affiliate_referred_by_code)
        .eq("status", "approved")
        .maybeSingle();
      if (affiliate) {
        const amountCents = line?.amount ?? 0;
        await admin.database.from("affiliate_conversions").upsert(
          {
            affiliate_id: affiliate.id,
            referred_user_id: subjectId,
            tier,
            amount_charged_cents: amountCents,
            commission_cents: Math.round(amountCents * affiliate.commission_rate),
          },
          { onConflict: "referred_user_id", ignoreDuplicates: true },
        );
      }
    }
  }
}

async function handleInvoicePaymentFailed(admin: ReturnType<typeof createAdminDbClient>, invoice: Stripe.Invoice) {
  const invoiceAny = invoice as unknown as {
    metadata?: Stripe.Metadata | null;
    lines: { data: Array<{ metadata?: Stripe.Metadata | null }> };
  };
  const subjectId = invoiceAny.lines.data[0]?.metadata?.supabase_user_id ?? invoiceAny.metadata?.supabase_user_id ?? null;
  if (!subjectId) return;
  await admin.database.from("user_subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("user_id", subjectId);
}

async function handleSubscriptionDeleted(admin: ReturnType<typeof createAdminDbClient>, subscription: Stripe.Subscription) {
  const subjectId = getSubjectId(subscription);
  if (!subjectId) return;
  await admin.database
    .from("user_subscriptions")
    .update({ tier: "recon", status: "canceled", updated_at: new Date().toISOString() })
    .eq("user_id", subjectId);
}

async function handleCheckoutCompleted(admin: ReturnType<typeof createAdminDbClient>, session: Stripe.Checkout.Session) {
  if (session.mode !== "payment") return; // subscription checkouts fulfill from invoice.paid instead

  const tier = session.metadata?.plan_tier;
  if (!tier) return; // some other one-time checkout this app runs, not a plan purchase

  const subjectId = session.client_reference_id ?? session.metadata?.supabase_user_id ?? null;
  if (!subjectId) {
    console.warn(`[webhooks/stripe] checkout.session.completed ${session.id} (tier ${tier}) has no resolvable Sortie user`);
    return;
  }

  const { data: maxSeatsRow } = await admin.database.from("subscription_plans").select("max_seats").eq("tier", tier).maybeSingle();

  if (maxSeatsRow?.max_seats !== null && maxSeatsRow?.max_seats !== undefined) {
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
    const { data: seat } = await admin.database.rpc("claim_plan_seat", {
      p_tier: tier,
      p_user_id: subjectId,
      p_checkout_session_id: session.id,
      p_payment_intent_id: paymentIntentId,
    });
    if (seat === null || seat === undefined) {
      // Charged but sold out — same real race the pre-checkout seat check
      // can't fully close (see actions/billing.ts's own comment). Never
      // silently drop this; flagged for a manual refund, never granted
      // past the cap.
      console.error(`[webhooks/stripe] Seat sold out at fulfillment — checkout ${session.id} (user ${subjectId}) was paid but no seat remained, needs a manual refund`);
      return;
    }
  }

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  await admin.database.from("user_subscriptions").upsert(
    {
      user_id: subjectId,
      tier,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      payment_customer_id: customerId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error("[webhooks/stripe] signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const admin = createAdminDbClient();

  try {
    switch (event.type) {
      case "invoice.paid":
        await handleInvoicePaid(admin, event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(admin, event.data.object as Stripe.Invoice);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(admin, event.data.object as Stripe.Subscription);
        break;
      case "checkout.session.completed":
        await handleCheckoutCompleted(admin, event.data.object as Stripe.Checkout.Session);
        break;
    }
  } catch (err) {
    console.error(`[webhooks/stripe] handling ${event.type} failed`, err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
