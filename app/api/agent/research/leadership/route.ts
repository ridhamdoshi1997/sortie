import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { researchLeadershipTeam } from "@/agent/research";
import { getCurrentUser } from "@/lib/auth";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { createInsforgeServer } from "@/lib/insforge-server";
import { toUserMessage } from "@/lib/errors";
import type { AgentLog, CompanyResearchDossier, Job } from "@/types";

type RequestBody = {
  jobId?: unknown;
};

type LeadershipJobRow = Pick<
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

    const rateLimit = await checkRateLimit(insforge, userId, user.email, "agent/research/leadership");
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
        console.error("[api/agent/research/leadership] logAgentMessage", error);
      }
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select(
        "id,user_id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills,company_research",
      )
      .eq("id", jobId)
      .eq("user_id", userId)
      .maybeSingle<LeadershipJobRow>();

    if (jobError) {
      console.error("[api/agent/research/leadership] fetch job", jobError);
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

    // leadershipLookedUp (not just a non-empty team) — a prior search that
    // found nothing already spent whatever it was going to spend (including
    // the paid Apify fallback). Repeat clicks return that cached empty
    // result instead of re-running and re-paying every time.
    if (job.company_research.leadershipTeam?.length || job.company_research.leadershipLookedUp) {
      return NextResponse.json({
        success: true,
        data: { leadershipTeam: job.company_research.leadershipTeam ?? [] },
      });
    }

    // Shares the same "company_research" spend bucket as the main dossier —
    // it's conceptually the same kind of spend, not a separate quota to manage.
    const usage = await checkAndConsumeUsage(insforge, userId, user.email, "company_research");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    await logAgentMessage({
      message: `Looking up the leadership team for ${job.company ?? "this company"}.`,
      level: "info",
    });

    const result = await researchLeadershipTeam(job, logAgentMessage);

    if (!result.success) {
      // Missing Browserbase credentials is an environment config gap, not a
      // crash — 503 keeps it out of "something is broken" server-error logs.
      const status = result.error === "Leadership lookup is not configured." ? 503 : 500;
      return NextResponse.json({ success: false, error: result.error }, { status });
    }

    const mergedDossier: CompanyResearchDossier = {
      ...job.company_research,
      leadershipTeam: result.leadershipTeam,
      leadershipLookedUp: true,
    };

    const { data: updatedJob, error: updateError } = await insforge.database
      .from("jobs")
      .update({ company_research: mergedDossier })
      .eq("id", jobId)
      .eq("user_id", userId)
      .select("company_research")
      .maybeSingle<{ company_research: CompanyResearchDossier | null }>();

    if (updateError || !updatedJob?.company_research) {
      console.error("[api/agent/research/leadership] update job", updateError);
      return NextResponse.json(
        { success: false, error: "Failed to save leadership team" },
        { status: 500 },
      );
    }

    revalidatePath(`/find-jobs/${jobId}`);

    return NextResponse.json({
      success: true,
      data: { leadershipTeam: updatedJob.company_research.leadershipTeam },
    });
  } catch (error) {
    console.error("[api/agent/research/leadership]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
