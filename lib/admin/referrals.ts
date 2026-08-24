import { createAdminDbClient } from "@/lib/admin/client";

// Admin visibility for the referral system (Phase 18 item 3). Read-only —
// all reward-granting logic lives in actions/referrals.ts's claimReferralCode.
export type ReferralOverview = {
  totalReferrals: number;
  topReferrers: Array<{ userId: string; email: string | null; count: number }>;
};

export async function getReferralOverview(): Promise<ReferralOverview> {
  const admin = createAdminDbClient();

  const { data: rewards } = await admin.database.from("referral_rewards").select("referrer_id");
  const rows = (rewards ?? []) as { referrer_id: string }[];

  const countByReferrer = new Map<string, number>();
  for (const row of rows) {
    countByReferrer.set(row.referrer_id, (countByReferrer.get(row.referrer_id) ?? 0) + 1);
  }

  const topIds = Array.from(countByReferrer.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  let emailById = new Map<string, string | null>();
  if (topIds.length > 0) {
    const { data: profiles } = await admin.database.from("profiles").select("id,email").in("id", topIds);
    emailById = new Map(((profiles ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  }

  return {
    totalReferrals: rows.length,
    topReferrers: topIds.map((id) => ({ userId: id, email: emailById.get(id) ?? null, count: countByReferrer.get(id) ?? 0 })),
  };
}
