"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { getReferralOverview, type ReferralOverview } from "@/lib/admin/referrals";
import { toUserMessage } from "@/lib/errors";

type Result = { success: true; overview: ReferralOverview } | { success: false; error: string };

export async function getReferralOverviewAction(): Promise<Result> {
  try {
    await requireAdmin();
    const overview = await getReferralOverview();
    return { success: true, overview };
  } catch (error) {
    return { success: false, error: toUserMessage(error, "Not authorized.") };
  }
}
