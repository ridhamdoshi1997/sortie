"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { createAdminClient } from "@/lib/admin/client";
import { toUserMessage } from "@/lib/errors";

// Referral system (Phase 18 item 3, context/RESUME.md). Own-row ops go
// through the normal cookie-scoped client (profiles_update_own RLS already
// covers referral_code/referred_by_code — neither is in the protected-field
// trigger). Resolving another user's id by referral code, and granting the
// reward bump, need the service-role client — same local-helper pattern as
// actions/account.ts's adminClient(), not lib/admin/client.ts's
// createAdminDbClient() (that one is documented admin-route-only, gated by
// requireAdmin() at every call site, which a plain user action never calls).
function serviceClient() {
  return createAdminClient({
    baseUrl: process.env.NEXT_PUBLIC_INSFORGE_URL!,
    apiKey: process.env.INSFORGE_API_KEY!,
  });
}

const MAX_MULTIPLIER = 2.0;
const MULTIPLIER_BUMP = 0.1;

function generateCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

type CodeResult = { success: true; code: string } | { success: false; error: string };

// Lazily generated on first Settings visit, same pattern as user_api_keys'
// on-demand key generation. Collision-retried against the real UNIQUE
// constraint rather than pre-checked — the constraint is the source of
// truth, a pre-check would just be a redundant race-prone read.
export async function getOrCreateReferralCode(): Promise<CodeResult> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("referral_code")
      .eq("id", user.id)
      .maybeSingle<{ referral_code: string | null }>();

    if (profile?.referral_code) return { success: true, code: profile.referral_code };

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateCode();
      const { error } = await insforge.database.from("profiles").update({ referral_code: code }).eq("id", user.id);
      if (!error) return { success: true, code };
      if (!error.message?.toLowerCase().includes("unique") && !error.message?.toLowerCase().includes("duplicate")) {
        return { success: false, error: toUserMessage(error, "Failed to generate a referral code.") };
      }
    }
    return { success: false, error: "Failed to generate a unique referral code — try again." };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to generate a referral code.") };
  }
}

type StatsResult =
  | { success: true; code: string | null; invitedCount: number; multiplier: number; alreadyReferredBy: boolean }
  | { success: false; error: string };

export async function getReferralStats(): Promise<StatsResult> {
  try {
    const user = await requireUser();
    const insforge = await createInsforgeServer();

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("referral_code,custom_usage_multiplier,referred_by_code")
      .eq("id", user.id)
      .maybeSingle<{ referral_code: string | null; custom_usage_multiplier: number; referred_by_code: string | null }>();

    const { count } = await insforge.database
      .from("referral_rewards")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id);

    return {
      success: true,
      code: profile?.referral_code ?? null,
      invitedCount: count ?? 0,
      multiplier: profile?.custom_usage_multiplier ?? 1,
      alreadyReferredBy: Boolean(profile?.referred_by_code),
    };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to load referral stats.") };
  }
}

type ClaimResult = { success: true } | { success: false; error: string };

// Called once, client-side, right after a fresh signup notices a pending
// ?ref= code in localStorage (components/referrals/ReferralClaimer.tsx).
// A no-op (not an error) if this user already claimed a code — the caller
// clears its local pending-code state on any success response either way.
export async function claimReferralCode(rawCode: string): Promise<ClaimResult> {
  try {
    const user = await requireUser();
    const code = rawCode.trim().toUpperCase();
    if (!code) return { success: false, error: "No code given." };

    const insforge = await createInsforgeServer();
    const { data: profile } = await insforge.database
      .from("profiles")
      .select("referral_code,referred_by_code")
      .eq("id", user.id)
      .maybeSingle<{ referral_code: string | null; referred_by_code: string | null }>();

    if (!profile) return { success: false, error: "Profile not found." };
    if (profile.referred_by_code) return { success: true }; // already claimed — silent no-op
    if (profile.referral_code === code) return { success: false, error: "You can't refer yourself." };

    const admin = serviceClient();
    const { data: referrer } = await admin.database
      .from("profiles")
      .select("id,custom_usage_multiplier")
      .eq("referral_code", code)
      .maybeSingle<{ id: string; custom_usage_multiplier: number }>();

    if (!referrer) return { success: false, error: "Referral code not found." };
    if (referrer.id === user.id) return { success: false, error: "You can't refer yourself." };

    const { error: claimError } = await insforge.database.from("profiles").update({ referred_by_code: code }).eq("id", user.id);
    if (claimError) return { success: false, error: toUserMessage(claimError, "Failed to save this referral.") };

    // Reward grant — idempotent via referral_rewards.referred_id's real
    // UNIQUE constraint. A duplicate-insert failure here just means this
    // referred user was already rewarded through some earlier path; not an
    // error worth surfacing to this claim call.
    const { error: rewardError } = await admin.database
      .from("referral_rewards")
      .insert([{ referrer_id: referrer.id, referred_id: user.id, multiplier_bump: MULTIPLIER_BUMP }]);

    if (!rewardError) {
      const newMultiplier = Math.min(MAX_MULTIPLIER, (referrer.custom_usage_multiplier ?? 1) + MULTIPLIER_BUMP);
      await admin.database.from("profiles").update({ custom_usage_multiplier: newMultiplier }).eq("id", referrer.id);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Failed to claim this referral.") };
  }
}
