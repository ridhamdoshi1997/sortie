import React from "react";
import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { resolveModelForUser } from "@/lib/subscription";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { complete, getModel } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";
import { ResumePDF, type GeneratedContent } from "@/components/documents/ResumePDF";
import { buildDefaultSections, buildDefaultStyle } from "@/lib/resumeSections";

function createResumeDocument(
  profile: Profile,
  sections: ResumeSection[],
  style: ResumeStyle,
): React.ReactElement<DocumentProps> {
  // ResumePDF renders a @react-pdf <Document>; the cast bridges React's component
  // prop inference to the renderer's document element type.
  return (
    <ResumePDF profile={profile} sections={sections} style={style} />
  ) as unknown as React.ReactElement<DocumentProps>;
}

export async function POST(): Promise<NextResponse> {
  try {
    if (!isFeatureEnabled("document_generation")) {
      return NextResponse.json(
        { success: false, error: featureDisabledMessage("document_generation") },
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

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "resume/generate");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const { data: profile, error: profileError } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 },
      );
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, profile.email, "document_generation");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    const profileContext = JSON.stringify({
      full_name: profile.full_name,
      current_title: profile.current_title,
      experience_level: profile.experience_level,
      years_experience: profile.years_experience,
      skills: profile.skills,
      industries: profile.industries,
      work_experience: profile.work_experience,
      education: profile.education,
      job_titles_seeking: profile.job_titles_seeking,
    });

    let raw: string;
    try {
      const { provider: genProvider, tier: genTier } = await resolveModelForUser(
        insforge, user.id, profile.email, profile.preferred_model,
      );
      raw = await complete(await getModel(genProvider, genTier), {
        systemPrompt:
          "You are an expert resume writer producing a polished, ATS-optimized resume. Given a candidate's profile data, produce a professional summary and rewrite each work experience entry's responsibilities as achievement-focused bullet points.\n\nRules:\n- Summary: 2-3 sentences, specific to this candidate. Never open with generic resume clichés like 'results-oriented', 'proven track record', 'dynamic professional', or similar boilerplate — state concretely what the candidate does and their strongest strength.\n- Bullets: 3-5 per role, each a single tight line (roughly 15-22 words), starting with a strong action verb. Never repeat the same opening verb across bullets in the resume. Quantify impact (scale, time saved, performance gain, team size) whenever the candidate's real experience supports a number — never invent a metric that isn't grounded in their profile.\n- Use only standard characters and punctuation (no special symbols, emoji, or unusual unicode) so the text extracts cleanly in ATS parsers.\n- Keep total content tight enough to fit cleanly on one page for a typical candidate — favor the most relevant, highest-impact bullets over exhaustive coverage of every responsibility.\n- Never claim a skill or a piece of experience the candidate does not actually have.\n\nReturn only valid JSON.",
        userPrompt: `Generate polished resume content for this candidate and return JSON matching this exact shape:
{
  "summary": "string — 2-3 sentence professional summary",
  "work_experience": [
    {
      "company": "string",
      "title": "string",
      "start_date": "string",
      "end_date": "string | null",
      "is_current": false,
      "bullets": ["string", "string", "string"]
    }
  ]
}

Candidate profile:
${profileContext}`,
        temperature: 0.7,
        // A full resume (summary + every role's bullets) overruns 1000 tokens
        // and truncates mid-JSON, which surfaced as "Failed to parse AI
        // response". maxTokens is a ceiling, not a charge — raising it costs
        // nothing unless the output is genuinely longer.
        maxTokens: 4000,
        jsonResponse: true,
      });
    } catch (error) {
      console.error("[api/resume/generate] AI completion failed", error);
      return NextResponse.json(
        { success: false, error: "AI returned an empty response" },
        { status: 500 },
      );
    }

    let generated: GeneratedContent;
    try {
      generated = JSON.parse(raw) as GeneratedContent;
    } catch {
      console.error("[api/resume/generate] JSON parse failed", raw);
      return NextResponse.json(
        { success: false, error: "Failed to parse AI response" },
        { status: 500 },
      );
    }

    // Render PDF buffer server-side. This is the base résumé (/profile) —
    // it has no `resume_sections`/`resume_style` row of its own to persist
    // to (that only exists for AI-tailored per-job copies), so it's built
    // fresh from defaults on every generate rather than loaded/saved.
    const sections = buildDefaultSections(profile, generated);
    const style = buildDefaultStyle(profile.preferred_resume_theme);
    const buffer = await renderToBuffer(createResumeDocument(profile, sections, style));

    // Remove existing file then upload fresh (SDK has no upsert — matches actions/profile.ts pattern)
    const path = `${user.id}/resume.pdf`;
    await insforge.storage.from("resumes").remove(path);

    // InsForge storage upload expects a Blob — wrap the Node Buffer.
    // Cast to ArrayBuffer to satisfy strict TS — Buffer is a safe subtype at runtime.
    const blob = new Blob([buffer as unknown as ArrayBuffer], {
      type: "application/pdf",
    });

    const { error: uploadError } = await insforge.storage
      .from("resumes")
      .upload(path, blob);

    if (uploadError) {
      console.error("[api/resume/generate] storage upload", uploadError);
      return NextResponse.json(
        { success: false, error: "Failed to upload resume" },
        { status: 500 },
      );
    }

    const { error: dbError } = await insforge.database
      .from("profiles")
      .update({ resume_pdf_url: path })
      .eq("id", user.id);

    if (dbError) {
      console.error("[api/resume/generate] db update", dbError);
      return NextResponse.json(
        { success: false, error: "Failed to save resume URL" },
        { status: 500 },
      );
    }

    revalidatePath("/profile");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[api/resume/generate]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
