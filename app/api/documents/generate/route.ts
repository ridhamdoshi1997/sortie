import React from "react";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";

import { researchCompany } from "@/agent/research";
import { generateCoverLetter, generateTailoredResume } from "@/agent/documents";
import { resolveProvider } from "@/lib/access";
import { getCurrentUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { persistGeneratedDocument } from "@/lib/documentPersistence";
import { getModel } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { ResumePDF } from "@/app/api/resume/generate/ResumePDF";
import { CoverLetterPDF } from "./CoverLetterPDF";
import type { CompanyResearchDossier, Job, Profile } from "@/types";

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

    const provider = resolveProvider(profile.preferred_model, profile.email);

    const usage = await checkAndConsumeUsage(insforge, user.id, profile.email, "document_generation");
    if (!usage.allowed) {
      return NextResponse.json({ success: false, error: usage.error }, { status: 429 });
    }

    // "Generate" is one click start to finish — research the company first
    // if it hasn't been researched yet, same logic as /api/agent/research.
    let dossier: CompanyResearchDossier | null = job.company_research;
    if (!dossier) {
      const researchResult = await researchCompany({ job, profile, provider });
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

    const theme = profile.preferred_resume_theme ?? "modern";
    let pdfBuffer: Buffer;
    let generatedContentText: string;

    if (kind === "resume") {
      const generated = await generateTailoredResume({ job, profile, dossier, provider });
      generatedContentText = JSON.stringify(generated);
      pdfBuffer = await renderToBuffer(
        React.createElement(ResumePDF, { profile, generated, theme }) as unknown as React.ReactElement<DocumentProps>,
      );
    } else {
      const letterBody = await generateCoverLetter({ job, profile, dossier, provider });
      generatedContentText = letterBody;
      pdfBuffer = await renderToBuffer(
        React.createElement(CoverLetterPDF, {
          profile,
          company: job.company,
          letterBody,
          theme,
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

    revalidatePath(`/find-jobs/${jobId}`);

    return NextResponse.json({
      success: true,
      data: { pdfUrl: persistResult.storagePath },
    });
  } catch (error) {
    console.error("[api/documents/generate]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
