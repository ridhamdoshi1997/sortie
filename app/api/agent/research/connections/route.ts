import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { researchInsiderConnections } from "@/agent/research";
import { getCurrentUser } from "@/lib/auth";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { createInsforgeServer } from "@/lib/insforge-server";
import { toUserMessage } from "@/lib/errors";
import type { AgentLog, CompanyResearchDossier, Job, Profile } from "@/types";

type RequestBody = {
  jobId?: unknown;
};

type ConnectionsJobRow = Pick<
  Job,
  | "id"
  | "user_id"
  | "title"
  | "company"
  | "source_url"
  | "external_apply_url"
  | "about_role"
  | "matched_skills"
  | "missing_skills"
  | "company_research"
>;

type ConnectionsProfileRow = Pick<
  Profile,
  "current_title" | "experience_level" | "years_experience" | "skills" | "work_experience" | "education"
>;

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Same flag as the main dossier — this is still company research, just
    // a separate opt-in slice of it.
    if (!isFeatureEnabled("company_research")) {
      return NextResponse.json(
        { success: false, error: featureDisabledMessage("company_research") },
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
    const userId = user.id;

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

    const rateLimit = await checkRateLimit(insforge, userId, user.email, "agent/research/connections");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    async function logAgentMessage(input: {
      message: string;
      level: AgentLog["level"];
    }): Promise<void> {
      const { error } = await insforge.database.from("agent_logs").insert([
        {
          run_id: null,
          user_id: userId,
          job_id: jobId,
          message: input.message,
          level: input.level,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error("[api/agent/research/connections] logAgentMessage", error);
      }
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select(
        "id,user_id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills,company_research",
      )
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle<ConnectionsJobRow>();

    if (jobError) {
      console.error("[api/agent/research/connections] fetch job", jobError);
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

    if (!job.company_research) {
      return NextResponse.json(
        { success: false, error: "Run company research first." },
        { status: 400 },
      );
    }

    // insiderConnectionsLookedUp — the exact re-spend guard already fixed
    // for leadershipLookedUp, built in from the start here instead of
    // needing a follow-up patch. A prior search (even one that found
    // nothing) already spent whatever it was going to spend — repeat
    // clicks return the cached result instead of re-running and re-paying.
    const hasConnections =
      (job.company_research.insiderConnections?.beyondNetwork?.length ?? 0) > 0 ||
      (job.company_research.insiderConnections?.previousCompany?.length ?? 0) > 0 ||
      (job.company_research.insiderConnections?.school?.length ?? 0) > 0;

    if (hasConnections || job.company_research.insiderConnectionsLookedUp) {
      return NextResponse.json({
        success: true,
        data: {
          connections: job.company_research.insiderConnections ?? {
            beyondNetwork: [],
            previousCompany: [],
            school: [],
          },
        },
      });
    }

    const usage = await checkAndConsumeUsage(insforge, userId, user.email, "insider_connections");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    const { data: profile, error: profileError } = await insforge.database
      .from("profiles")
      .select("current_title,experience_level,years_experience,skills,work_experience,education")
      .eq("id", userId)
      .maybeSingle<ConnectionsProfileRow>();

    if (profileError || !profile) {
      console.error("[api/agent/research/connections] fetch profile", profileError);
      return NextResponse.json(
        { success: false, error: "Failed to load profile" },
        { status: 500 },
      );
    }

    await logAgentMessage({
      message: `Looking up insider connections at ${job.company ?? "this company"}.`,
      level: "info",
    });

    const result = await researchInsiderConnections(job, profile, logAgentMessage);

    if (!result.success) {
      const status = result.error === "Insider connections lookup is not configured." ? 503 : 500;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    const mergedDossier: CompanyResearchDossier = {
      ...job.company_research,
      insiderConnections: result.connections,
      insiderConnectionsLookedUp: true,
    };

    const { data: updatedJob, error: updateError } = await insforge.database
      .from("jobs")
      .update({ company_research: mergedDossier })
      .eq("id", jobId)
      .eq("user_id", userId)
      .select("company_research")
      .maybeSingle<{ company_research: CompanyResearchDossier | null }>();

    if (updateError || !updatedJob?.company_research) {
      console.error("[api/agent/research/connections] update job", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to save insider connections" },
        { status: 500 },
      );
    }

    revalidatePath(`/find-jobs/${jobId}`);

    return NextResponse.json({
      success: true,
      data: { connections: updatedJob.company_research.insiderConnections },
    });
  } catch (error) {
    console.error("[api/agent/research/connections]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
