import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { toUserMessage } from "@/lib/errors";
import { extractBearerToken, getAdminClient, resolveApiKeyUser, touchApiKeyLastUsed } from "@/lib/extensionAuth";
import { generateScorePreview } from "@/lib/extensionScorePreview";
import { checkAndConsumeUsage } from "@/lib/usage";
import type { Profile } from "@/types";

// Extension inline match-score badge backend. Bearer-token-authed like every
// other /api/extension/* route. Deliberately checks for an existing tracked
// job with the same title+company FIRST — a real saved job's own
// jobs.match_score is reused for free, since the user is very likely
// re-visiting a posting they already have in their tracker (or found via a
// real search that already scored it) rather than something genuinely new.
// Only a real cache miss spends the usage-gated AI call in
// lib/extensionScorePreview.ts.
const bodySchema = z.object({
  title: z.string().min(1),
  company: z.string().min(1),
  description: z.string().min(1),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const rawKey = extractBearerToken(request);
    if (!rawKey) {
      return NextResponse.json({ error: "Missing bearer token" }, { status: 401 });
    }

    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid job payload" }, { status: 400 });
    }

    const admin = getAdminClient();
    const apiKey = await resolveApiKeyUser(admin, rawKey);
    if (!apiKey) {
      return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }
    touchApiKeyLastUsed(admin, apiKey.id);

    const { data: existingJob } = await admin.database
      .from("jobs")
      .select("match_score,missing_skills")
      .eq("user_id", apiKey.user_id)
      .eq("title", parsed.data.title)
      .eq("company", parsed.data.company)
      .not("match_score", "is", null)
      .order("found_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ match_score: number; missing_skills: string[] | null }>();

    if (existingJob) {
      return NextResponse.json(
        {
          success: true,
          preview: { matchScore: existingJob.match_score, missingSkills: (existingJob.missing_skills ?? []).slice(0, 5) },
          cached: true,
        },
        { status: 200 },
      );
    }

    const { data: profile } = await admin.database
      .from("profiles")
      .select("current_title,experience_level,years_experience,skills,job_titles_seeking")
      .eq("id", apiKey.user_id)
      .maybeSingle<Pick<Profile, "current_title" | "experience_level" | "years_experience" | "skills" | "job_titles_seeking">>();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    const usage = await checkAndConsumeUsage(admin, apiKey.user_id, null, "extension_score_preview");
    if (!usage.allowed) {
      return NextResponse.json({ error: usage.error }, { status: 429 });
    }

    const preview = await generateScorePreview(profile as Profile, parsed.data);

    return NextResponse.json({ success: true, preview, cached: false }, { status: 200 });
  } catch (error) {
    console.error("[api/extension/score-preview]", error);
    return NextResponse.json({ error: toUserMessage(error) }, { status: 500 });
  }
}
