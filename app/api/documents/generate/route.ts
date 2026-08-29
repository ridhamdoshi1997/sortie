import React from "react";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { researchCompany } from "@/agent/research";
import { generateCoverLetter, generateTailoredResume } from "@/agent/documents";
import { resolveModelForUser } from "@/lib/subscription";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { persistGeneratedDocument } from "@/lib/documentPersistence";
import { getModel } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { toUserMessage } from "@/lib/errors";
import { ResumePDF } from "@/components/documents/ResumePDF";
import { CoverLetterPDF } from "@/components/documents/CoverLetterPDF";
import { buildDefaultStyle, mergeGeneratedContent } from "@/lib/resumeSections";
import { rescoreAgainstTailoredResume, type ScoreJumpResult } from "@/lib/scoreJump";
import type { CompanyResearchDossier, Job, Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type RequestBody = {
  jobId?: unknown;
  kind?: unknown;
};

type DocumentJobRow = Pick<
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
    const kind = body.kind === "resume" || body.kind === "cover_letter" ? body.kind : null;

    if (!jobId || !isUuid(jobId)) {
      return NextResponse.json(
        { success: false, error: "jobId is required" },
        { status: 400 },
      );
    }
    if (!kind) {
      return NextResponse.json(
        { success: false, error: "kind must be 'resume' or 'cover_letter'" },
        { status: 400 },
      );
    }

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/generate");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select(
        "id,user_id,title,company,source_url,external_apply_url,about_role,matched_skills,missing_skills,company_research",
      )
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<DocumentJobRow>();

    if (jobError) {
      console.error("[api/documents/generate] fetch job", jobError);
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
      console.error("[api/documents/generate] fetch profile", profileError);
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 },
      );
    }

    const { provider, tier } = await resolveModelForUser(insforge, user.id, profile.email, profile.preferred_model);

    const usage = await checkAndConsumeUsage(insforge, user.id, profile.email, "document_generation");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    // "Generate" is one click start to finish — research the company first
    // if it hasn't been researched yet, same logic as /api/agent/research.
    let dossier: CompanyResearchDossier | null = job.company_research;
    if (!dossier) {
      const researchResult = await researchCompany({ job, profile, provider, tier });
      if (!researchResult.success) {
        return NextResponse.json(
          { success: false, error: "Company research failed, needed before generating" },
          { status: 500 },
        );
      }
      dossier = researchResult.dossier;

      const { error: researchUpdateError } = await insforge.database
        .from("jobs")
        .update({ company_research: dossier })
        .eq("id", jobId)
        .eq("user_id", user.id);

      if (researchUpdateError) {
        console.error(
          "[api/documents/generate] save research",
          researchUpdateError,
        );
      }
    }

    let pdfBuffer: Buffer;
    let generatedContentText: string;
    // Only set for kind === "resume" — the résumé editor workspace's own
    // per-copy content/style snapshot, saved to `applications` right after
    // persistGeneratedDocument below confirms the row exists.
    let resumeSections: ResumeSection[] | null = null;
    let resumeStyle: ResumeStyle | null = null;

    if (kind === "resume") {
      // Regenerate preserves whatever's already in the workspace (manual
      // skills/education edits, section order/visibility, chosen style) —
      // only the AI-authored summary/bullets get refreshed. First-ever
      // generate for this job has nothing to preserve, so it builds fresh.
      const { data: existingApp } = await insforge.database
        .from("applications")
        .select("resume_sections,resume_style")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle<{ resume_sections: ResumeSection[] | null; resume_style: ResumeStyle | null }>();

      const generated = await generateTailoredResume({ job, profile, dossier, provider, tier });
      generatedContentText = JSON.stringify(generated);
      resumeSections = mergeGeneratedContent(existingApp?.resume_sections ?? null, generated, profile);
      resumeStyle = existingApp?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);
      pdfBuffer = await renderToBuffer(
        React.createElement(ResumePDF, {
          profile,
          sections: resumeSections,
          style: resumeStyle,
        }) as unknown as React.ReactElement<DocumentProps>,
      );
    } else {
      // Cover letters share the tailored résumé's exact style (same
      // template+theme, one visually matched suite per job — see
      // CoverLetterPDF.tsx's own comment) — read whatever's already saved
      // for this job's résumé, falling back to the user's preferred theme
      // default if no résumé has been styled yet.
      const { data: existingStyleRow } = await insforge.database
        .from("applications")
        .select("resume_style,cover_letter_salutation")
        .eq("user_id", user.id)
        .eq("job_id", jobId)
        .maybeSingle<{ resume_style: ResumeStyle | null; cover_letter_salutation: string | null }>();
      const coverLetterStyle = existingStyleRow?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);

      const letterBody = await generateCoverLetter({ job, profile, dossier, provider, tier });
      generatedContentText = letterBody;
      pdfBuffer = await renderToBuffer(
        React.createElement(CoverLetterPDF, {
          profile,
          company: job.company,
          letterBody,
          style: coverLetterStyle,
          salutation: existingStyleRow?.cover_letter_salutation,
        }) as unknown as React.ReactElement<DocumentProps>,
      );
    }

    const persistResult = await persistGeneratedDocument({
      insforge,
      userId: user.id,
      jobId,
      kind,
      pdfBuffer,
      contentText: generatedContentText,
      modelUsed: (await getModel(provider, tier)).model,
    });

    if (!persistResult.success) {
      return NextResponse.json(
        { success: false, error: persistResult.error },
        { status: 500 },
      );
    }

    let scoreJump: ScoreJumpResult | null = null;
    if (resumeSections && resumeStyle) {
      const { error: sectionsError } = await insforge.database
        .from("applications")
        .update({ resume_sections: resumeSections, resume_style: resumeStyle, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("job_id", jobId);
      if (sectionsError) {
        console.error("[api/documents/generate] save resume_sections/resume_style", sectionsError);
      }
      scoreJump = await rescoreAgainstTailoredResume(insforge, user.id, jobId, profile, resumeSections, provider, tier);
    }

    revalidatePath(`/find-jobs/${jobId}`);
    revalidatePath(`/resume/tailored/${jobId}`);

    return NextResponse.json({
      success: true,
      data: { pdfUrl: persistResult.storagePath, scoreJump, sections: resumeSections, style: resumeStyle },
    });
  } catch (error) {
    console.error("[api/documents/generate]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
