import React from "react";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { reviseCoverLetter, reviseTailoredResume, type ChatMessage } from "@/agent/documents";
import { resolveProvider } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { persistGeneratedDocument } from "@/lib/documentPersistence";
import { getModel } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { toUserMessage } from "@/lib/errors";
import { ResumePDF, type GeneratedContent } from "@/components/documents/ResumePDF";
import { CoverLetterPDF } from "@/components/documents/CoverLetterPDF";
import { buildDefaultStyle, mergeGeneratedContent } from "@/lib/resumeSections";
import { rescoreAgainstTailoredResume, type ScoreJumpResult } from "@/lib/scoreJump";
import type { Job, Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

type RequestBody = {
  jobId?: unknown;
  kind?: unknown;
  messages?: unknown;
};

type DocumentJobRow = Pick<
  Job,
  | "id"
  | "user_id"
  | "title"
  | "company"
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

function isValidMessages(value: unknown): value is ChatMessage[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        (item.role === "user" || item.role === "assistant") &&
        typeof item.content === "string",
    )
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
    if (!isValidMessages(body.messages)) {
      return NextResponse.json(
        { success: false, error: "messages is required" },
        { status: 400 },
      );
    }
    const messages = body.messages;

    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/chat");
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, error: rateLimit.error }, { status: 429 });
    }

    const { data: job, error: jobError } = await insforge.database
      .from("jobs")
      .select(
        "id,user_id,title,company,about_role,matched_skills,missing_skills,company_research",
      )
      .eq("id", jobId)
      .eq("user_id", user.id)
      .maybeSingle<DocumentJobRow>();

    if (jobError) {
      console.error("[api/documents/chat] fetch job", jobError);
      return NextResponse.json(
        { success: false, error: "Failed to load job" },
        { status: 500 },
      );
    }
    if (!job || !job.company_research) {
      return NextResponse.json(
        { success: false, error: "Company research is required before revising a document" },
        { status: 404 },
      );
    }

    const { data: profile, error: profileError } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (profileError || !profile) {
      console.error("[api/documents/chat] fetch profile", profileError);
      return NextResponse.json(
        { success: false, error: "Profile not found" },
        { status: 404 },
      );
    }

    // Never trust client-sent document content — re-fetch what's actually
    // saved so a revision always builds on the real current state.
    const contentColumn = kind === "resume" ? "generated_resume" : "generated_cover_letter";
    const { data: application, error: applicationError } = await insforge.database
      .from("applications")
      .select(`${contentColumn},resume_sections,resume_style,cover_letter_salutation`)
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<{
        generated_resume?: string | null;
        generated_cover_letter?: string | null;
        resume_sections: ResumeSection[] | null;
        resume_style: ResumeStyle | null;
        cover_letter_salutation: string | null;
      }>();

    const currentContentText = application?.[contentColumn as "generated_resume" | "generated_cover_letter"];
    if (applicationError || !currentContentText) {
      return NextResponse.json(
        {
          success: false,
          error: "No document has been generated yet — generate one first before revising it.",
        },
        { status: 404 },
      );
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, profile.email, "document_generation");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    const dossier = job.company_research;
    const provider = resolveProvider(profile.preferred_model, profile.email);
    let pdfBuffer: Buffer;
    let generatedContentText: string;
    let reply: string;
    // Only set for kind === "resume" — re-saved after persistGeneratedDocument
    // below, same pattern as /api/documents/generate.
    let resumeSections: ResumeSection[] | null = null;
    let resumeStyle: ResumeStyle | null = null;

    if (kind === "resume") {
      const currentContent = JSON.parse(currentContentText) as GeneratedContent;
      const revised = await reviseTailoredResume({
        job,
        profile,
        dossier,
        provider,
        messages,
        currentContent,
      });
      reply = revised.reply;
      generatedContentText = JSON.stringify(revised.content);
      resumeSections = mergeGeneratedContent(application?.resume_sections ?? null, revised.content, profile);
      resumeStyle = application?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);
      pdfBuffer = await renderToBuffer(
        React.createElement(ResumePDF, {
          profile,
          sections: resumeSections,
          style: resumeStyle,
        }) as unknown as React.ReactElement<DocumentProps>,
      );
    } else {
      const revised = await reviseCoverLetter({
        job,
        profile,
        dossier,
        provider,
        messages,
        currentContent: currentContentText,
      });
      reply = revised.reply;
      generatedContentText = revised.content;
      // Shares the résumé's exact style (see CoverLetterPDF.tsx's comment) —
      // already fetched above as part of `application`, no second query.
      const coverLetterStyle = application?.resume_style ?? buildDefaultStyle(profile.preferred_resume_theme);
      pdfBuffer = await renderToBuffer(
        React.createElement(CoverLetterPDF, {
          profile,
          company: job.company,
          letterBody: revised.content,
          style: coverLetterStyle,
          salutation: application?.cover_letter_salutation,
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
      modelUsed: getModel(provider, "smart").model,
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
        console.error("[api/documents/chat] save resume_sections/resume_style", sectionsError);
      }
      scoreJump = await rescoreAgainstTailoredResume(insforge, user.id, jobId, profile, resumeSections, provider);
    }

    revalidatePath(`/find-jobs/${jobId}`);
    revalidatePath(`/resume/tailored/${jobId}`);
    revalidatePath(`/cover-letter/tailored/${jobId}`);

    return NextResponse.json({
      success: true,
      data: {
        reply,
        pdfUrl: persistResult.storagePath,
        scoreJump,
        sections: resumeSections,
        style: resumeStyle,
        // Only set for kind === "cover_letter" — CoverLetterWorkspace's own
        // local `letterBody` state has no other way to pick up a chat
        // revision (router.refresh() alone doesn't push new data into an
        // already-initialized useState, same reasoning as `sections` above).
        letterBody: kind === "cover_letter" ? generatedContentText : undefined,
      },
    });
  } catch (error) {
    console.error("[api/documents/chat]", error);
    return NextResponse.json(
      { success: false, error: toUserMessage(error) },
      { status: 500 },
    );
  }
}
