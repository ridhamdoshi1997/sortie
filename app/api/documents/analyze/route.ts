import { NextRequest, NextResponse } from "next/server";

import { analyzeResumeGap } from "@/agent/resumeGap";
import { resolveModelForUser } from "@/lib/subscription";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { toUserMessage } from "@/lib/errors";
import type { Job, Profile } from "@/types";

type RequestBody = {
  jobId?: unknown;
};

type AnalyzeJobRow = Pick<
  Job,
  "id" | "user_id" | "title" | "company" | "about_role" | "matched_skills" | "missing_skills"
>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (!isFeatureEnabled("resume_analysis")) {
      return NextResponse.json(
        { success: false, error: featureDisabledMessage("resume_analysis") },
        { status: 503 },
      );
    }

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    let body: RequestBody;
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid request body" },
        { status: 400 },
      );
    }

    const jobId = typeof body.jobId === "string" ? body.jobId.trim() : "";
    if (!jobId || !isUuid(jobId)) {
      return NextResponse.json(
        { success: false, error: "jobId is required" },
        { status: 400 },
      );
    }

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/analyze");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const usageResult = await checkAndConsumeUsage(
      insforge,
      user.id,
      user.email,
      "resume_analysis",
    );
    if (!usageResult.allowed) {
      return NextResponse.json(
        { success: false, error: usageResult.error },
        { status: 429 },
      );
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select("id,user_id,title,company,about_role,matched_skills,missing_skills")
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<AnalyzeJobRow>();

    if (jobError) {
      console.error("[api/documents/analyze] fetch job", jobError);
      return NextResponse.json(
        { success: false, error: "Failed to load job" },
        { status: 500 },
      );
    }
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    const { data: profile, error: profileError } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      console.error("[api/documents/analyze] fetch profile", profileError);
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 },
      );
    }

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile.preferred_model);
    const analysis = await analyzeResumeGap(job, profile, provider, tier);

    const { error: saveError } = await insforge.database
      .from("jobs")
      .update({ resume_analysis: analysis })
      .eq("id", jobId)
      .eq("user_id", user.id);

    if (saveError) {
      console.error("[api/documents/analyze] save analysis", saveError);
    }

    return NextResponse.json({ success: true, data: analysis });
  } catch (error) {
    console.error("[api/documents/analyze]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
