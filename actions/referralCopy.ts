"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveProvider } from "@/lib/access";
import { checkAndConsumeUsage } from "@/lib/usage";
import { generateReferralCopy, type ReferralChannel } from "@/lib/referralCopy";
import type { Profile } from "@/types";

type Result = { success: true; message: string } | { success: false; error: string };

// The real link is appended here (never AI-generated) so it can never be
// garbled or hallucinated by the model — same discipline as every other
// AI-drafted-then-human-reviewed surface in this app.
export async function generateReferralMessage(channel: ReferralChannel, link: string): Promise<Result> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "referral_message");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("current_title,preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "current_title" | "preferred_model">>();

    const provider = resolveProvider(profile?.preferred_model, user.email);
    const draft = await generateReferralCopy(channel, profile?.current_title ?? null, provider);

    return { success: true, message: `${draft}\n\n${link}` };
  } catch (error) {
    console.error("[actions/referralCopy] generateReferralMessage", error);
    return { success: false, error: "Failed to generate a referral message." };
  }
}
