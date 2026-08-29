"use server";

import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { resolveModelForUser } from "@/lib/subscription";
import { checkAndConsumeUsage } from "@/lib/usage";
import { generateOutreachMessage } from "@/lib/outreachMessage";
import type { Profile } from "@/types";

type Result = { success: true; message: string } | { success: false; error: string };

export async function generateOutreachMessageAction(
  jobId: string,
  personName: string,
  personTitle: string | null,
  connectionReason: string | null,
): Promise<Result> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const usageResult = await checkAndConsumeUsage(insforge, user.id, user.email, "outreach_message");
    if (!usageResult.allowed) {
      return { success: false, error: usageResult.error };
    }

    const { data: job } = await insforge.database
      .from("jobs")
      .select("title,company")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<{ title: string | null; company: string | null }>();

    if (!job) {
      return { success: false, error: "Job not found" };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile?.preferred_model);
    const message = await generateOutreachMessage(
      { personName, personTitle, connectionReason, company: job.company ?? "this company", jobTitle: job.title },
      provider,
      tier,
    );

    return { success: true, message };
  } catch (error) {
    console.error("[actions/outreachMessage] generateOutreachMessageAction", error);
    return { success: false, error: "Failed to generate an outreach message" };
  }
}
