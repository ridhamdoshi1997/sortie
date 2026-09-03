"use server";

import { createAdminClient } from "@/lib/admin/client";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { toUserMessage } from "@/lib/errors";

// Affiliate program (direct user request, 2026-08-30) — real cash
// commission for external marketing partners via PayPal Payouts, distinct
// from the existing peer-referral system (referral_code/referred_by_code,
// an in-app usage-multiplier reward). Same local service-client helper
// pattern actions/referrals.ts already established for "resolve another
// user's row, grant something service-role-only" ops.
function serviceClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export type AffiliateStatus = {
  applied: boolean;
  status: "pending" | "approved" | "rejected" | null;
  affiliateCode: string | null;
  paypalEmail: string | null;
  commissionRate: number | null;
  totalConversions: number;
  unpaidCents: number;
  paidCents: number;
};

type ApplyResult = { success: true; code: string } | { success: false; error: string };

// Self-service application — status always starts 'pending' (enforced by
// the affiliates_insert_own RLS policy's own WITH CHECK, not just this
// action), an admin has to approve before the code does anything (the
// fulfillment trigger only matches status='approved' affiliates).
export async function applyToBecomeAffiliate(paypalEmail: string): Promise<ApplyResult> {
  try {
    const user = await requireUser();
    const email = paypalEmail.trim();
    if (!email || !email.includes("@")) {
      return { success: false, error: "A valid PayPal email is required." };
    }

    const insforge = await createInsforgeServer();

    const { data: existing } = await insforge.database
      .from("affiliates")
      .select("affiliate_code")
      .eq("user_id", user.id)
      .maybeSingle<{ affiliate_code: string }>();

    if (existing) return { success: true, code: existing.affiliate_code };

    // Collision-retried against the real UNIQUE constraint, same pattern
    // getOrCreateReferralCode already established — the constraint is the
    // source of truth, a pre-check would just be a redundant race-prone read.
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await insforge.database
        .from("affiliates")
        .insert([{ user_id: user.id, affiliate_code: code, paypal_email: email }]);

      if (!error) return { success: true, code };
      if (!/duplicate|unique/i.test(error.message ?? "")) {
        return { success: false, error: toUserMessage(error, "Failed to submit your application.") };
      }
    }

    return { success: false, error: "Failed to generate a unique affiliate code — try again." };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to submit your application.") };
  }
}

export async function getMyAffiliateStatus(): Promise<AffiliateStatus> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const { data: affiliate } = await insforge.database
    .from("affiliates")
    .select("affiliate_code,paypal_email,commission_rate,status,id")
    .eq("user_id", user.id)
    .maybeSingle<{ affiliate_code: string; paypal_email: string; commission_rate: number; status: string; id: string }>();

  if (!affiliate) {
    return {
      applied: false,
      status: null,
      affiliateCode: null,
      paypalEmail: null,
      commissionRate: null,
      totalConversions: 0,
      unpaidCents: 0,
      paidCents: 0,
    };
  }

  const { data: conversions } = await insforge.database
    .from("affiliate_conversions")
    .select("commission_cents,paid_at")
    .eq("affiliate_id", affiliate.id)
    .returns<{ commission_cents: number; paid_at: string | null }[]>();

  const rows = conversions ?? [];
  const unpaidCents = rows.filter((r) => !r.paid_at).reduce((sum, r) => sum + r.commission_cents, 0);
  const paidCents = rows.filter((r) => r.paid_at).reduce((sum, r) => sum + r.commission_cents, 0);

  return {
    applied: true,
    status: affiliate.status as AffiliateStatus["status"],
    affiliateCode: affiliate.affiliate_code,
    paypalEmail: affiliate.paypal_email,
    commissionRate: affiliate.commission_rate,
    totalConversions: rows.length,
    unpaidCents,
    paidCents,
  };
}

type ClaimResult = { success: true } | { success: false; error: string };

// Called once, client-side, right after a fresh signup notices a pending
// ?aff= code in localStorage (components/affiliates/AffiliateClaimer.tsx).
// Deliberately a separate namespace/column from claimReferralCode's
// referred_by_code — a peer referral and an affiliate click are two
// different attribution sources and must never collide or overwrite each
// other. No reward-multiplier logic here (unlike peer referrals) — the
// commission itself is computed later, once, by the Stripe fulfillment
// trigger on this user's first real paid conversion.
export async function claimAffiliateCode(rawCode: string): Promise<ClaimResult> {
  try {
    const user = await requireUser();
    const code = rawCode.trim().toUpperCase();
    if (!code) return { success: false, error: "No code given." };

    const insforge = await createInsforgeServer();
    const { data: profile } = await insforge.database
      .from("profiles")
      .select("affiliate_referred_by_code")
      .eq("id", user.id)
      .maybeSingle<{ affiliate_referred_by_code: string | null }>();

    if (!profile) return { success: false, error: "Profile not found." };
    if (profile.affiliate_referred_by_code) return { success: true }; // already claimed — silent no-op

    const admin = serviceClient();
    const { data: affiliate } = await admin.database
      .from("affiliates")
      .select("id,user_id")
      .eq("affiliate_code", code)
      .maybeSingle<{ id: string; user_id: string }>();

    if (!affiliate) return { success: false, error: "Affiliate code not found." };
    if (affiliate.user_id === user.id) return { success: false, error: "You can't refer yourself." };

    const { error: claimError } = await insforge.database
      .from("profiles")
      .update({ affiliate_referred_by_code: code })
      .eq("id", user.id);

    if (claimError) return { success: false, error: toUserMessage(claimError, "Failed to save this attribution.") };

    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to claim this affiliate code.") };
  }
}
