"use server";

import { revalidatePath } from "next/cache";

import { resolveModelForUser } from "@/lib/subscription";
import { requireUser } from "@/lib/auth";
import { archiveCurrentDocument } from "@/lib/documentPersistence";
import { createInsforgeServer } from "@/lib/insforge-server";
import { complete, getModel } from "@/lib/models";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { buildQualityAnalysisText, runResumeQualityAnalysis } from "@/lib/resumeQuality";
import { rescoreAgainstTailoredResume, type ScoreJumpResult } from "@/lib/scoreJump";
import { BULLET_QUALITY_RULES, HUMANIZED_WRITING_RULES, USER_INSTRUCTION_PRECEDENCE } from "@/lib/writingStyle";
import type { Job, Profile, ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// Manual section edits (reorder, hide, per-type content changes) DO change
// what the résumé actually says, so — unlike style — they're worth
// re-scoring against, same as an AI regenerate/revise would be.
export async function saveResumeSections(
  jobId: string,
  sections: ResumeSection[],
): Promise<{ success: boolean; scoreJump?: ScoreJumpResult; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const { error } = await insforge.database
      .from("applications")
      .update({ resume_sections: sections, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("job_id", jobId);

    if (error) {
      console.error("[actions/documents] saveResumeSections", error);
      return { success: false, error: "Failed to save your changes" };
    }

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile.preferred_model);
    const scoreJump = await rescoreAgainstTailoredResume(insforge, user.id, jobId, profile, sections, provider, tier);

    revalidatePath(`/resume/tailored/${jobId}`);
    revalidatePath(`/find-jobs/${jobId}`);
    return { success: true, scoreJump };
  } catch (error) {
    console.error("[actions/documents] saveResumeSections", error);
    return { success: false, error: "Failed to save your changes" };
  }
}

// The AI Rewrite tab has nothing to show until *some* score exists —
// `jobs.resume_analysis` is only ever populated as a side effect of a save/
// regenerate/chat-revise, so a résumé nobody has touched yet in the
// workspace shows a completely empty tab with no way to get a first score.
// Gated the same way the pre-existing (profile-scoped) /api/documents/analyze
// route already was — same feature flag, rate-limit key, and usage cap —
// this is the tailored-résumé-scoped equivalent via rescoreAgainstTailoredResume.
export async function analyzeResumeFit(
  jobId: string,
  sections: ResumeSection[],
): Promise<{ success: boolean; scoreJump?: ScoreJumpResult; error?: string }> {
  if (!isFeatureEnabled("resume_analysis")) {
    return { success: false, error: featureDisabledMessage("resume_analysis") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/analyze");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "resume_analysis");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile.preferred_model);
    const scoreJump = await rescoreAgainstTailoredResume(insforge, user.id, jobId, profile, sections, provider, tier);

    revalidatePath(`/resume/tailored/${jobId}`);
    revalidatePath(`/find-jobs/${jobId}`);
    return { success: true, scoreJump };
  } catch (error) {
    console.error("[actions/documents] analyzeResumeFit", error);
    return { success: false, error: "Failed to analyze this résumé's fit." };
  }
}

// The whole-résumé quality grade (10-dimension rubric, narrative insight,
// vulnerabilities, per-bullet issues) — the tailored-résumé equivalent of
// actions/resumes.ts's analyzeResume, sharing the same underlying AI call
// (lib/resumeQuality.ts) and, deliberately, the same `resume_quality_analysis`
// usage bucket (3/day — a much bigger call than the fit-score check above,
// so it is NOT auto-run on every edit; only on demand or after Regenerate).
export async function analyzeTailoredResumeQuality(
  jobId: string,
  sections: ResumeSection[],
): Promise<{ success: boolean; analysis?: ResumeAnalysis; error?: string }> {
  if (!isFeatureEnabled("resume_quality_analysis")) {
    return { success: false, error: featureDisabledMessage("resume_quality_analysis") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/analyze-quality");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "resume_quality_analysis");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const [{ data: profile }, { data: job }] = await Promise.all([
      insforge.database.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>(),
      insforge.database
        .from("jobs")
        .select("title")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle<Pick<Job, "title">>(),
    ]);

    if (!profile) {
      return { success: false, error: "Profile not found" };
    }

    const targetRole = job?.title || profile.current_title || "the role this résumé targets";
    const résuméText = buildQualityAnalysisText(profile, sections, targetRole);
    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profile.preferred_model);
    const result = await runResumeQualityAnalysis(provider, tier, résuméText);

    if (!result.success || !result.analysis) {
      return { success: false, error: result.error };
    }

    const { error } = await insforge.database
      .from("applications")
      .update({ quality_analysis: result.analysis, quality_analyzed_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("job_id", jobId);

    if (error) {
      console.error("[actions/documents] analyzeTailoredResumeQuality db", error);
      return { success: false, error: "Failed to save the quality analysis" };
    }

    revalidatePath(`/resume/tailored/${jobId}`);
    return { success: true, analysis: result.analysis };
  } catch (error) {
    console.error("[actions/documents] analyzeTailoredResumeQuality", error);
    return { success: false, error: "Failed to analyze this résumé's quality." };
  }
}

// Same `bullet_rewrite` feature flag/usage cap as the base-profile bullet
// editor (actions/profile.ts's rewriteBullet) — rewriting one bullet is
// rewriting one bullet regardless of which surface triggered it, so this
// deliberately shares that quota bucket rather than introducing a second
// one. Adds real job context (title/company/missing skills) on top of the
// profile version's generic role-only context, since these bullets are
// meant to fit one specific posting, not a generic résumé.
export async function rewriteResumeBullet(
  jobId: string,
  entryTitle: string,
  entryCompany: string,
  bulletText: string,
  instruction?: string,
): Promise<{ success: boolean; text?: string; error?: string }> {
  if (!isFeatureEnabled("bullet_rewrite")) {
    return { success: false, error: featureDisabledMessage("bullet_rewrite") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "documents/rewrite-bullet");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "bullet_rewrite");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const [{ data: profile }, { data: job }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("preferred_model")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("jobs")
        .select("title,company,missing_skills")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle<Pick<Job, "title" | "company" | "missing_skills">>(),
    ]);

    const jobContext = job
      ? `Target job: ${job.title ?? "—"} at ${job.company ?? "—"}\nSkills this job wants that the résumé is currently missing: ${(job.missing_skills ?? []).join(", ") || "none recorded"}`
      : "";

    const { provider: rewriteProvider, tier: rewriteTier } = await resolveModelForUser(
      insforge, user.id, user.email, profile?.preferred_model,
    );
    const raw = await complete(await getModel(rewriteProvider, rewriteTier), {
      systemPrompt:
        `You are an expert resume writer. Rewrite a single work-experience bullet point to be more achievement-focused and better aligned with a specific target job. Default to a strong action verb and roughly 15-25 words on one line — these are defaults, not hard limits, and a user instruction overrides them. Do NOT invent any statistic, percentage, dollar amount, team size, or outcome not already stated or clearly implied in the original — only reframe, tighten, and better align what's already there. ${BULLET_QUALITY_RULES}\n\n${HUMANIZED_WRITING_RULES}\n\n${USER_INSTRUCTION_PRECEDENCE}\n\nReturn only valid JSON.`,
      userPrompt: `Role: ${entryTitle} at ${entryCompany}\n${jobContext}\nOriginal bullet: "${bulletText}"${instruction ? `\n\nUSER INSTRUCTION (primary requirement — follow this over the style defaults above): ${instruction}` : ""}\n\nReturn JSON with this exact shape: { "rewritten": string }`,
      temperature: 0.5,
      // Was 200. Reasoning tokens bill against this budget on Gemini 3,
      // so a 200-token ceiling truncates before the JSON even starts.
      maxTokens: 1200,
      jsonResponse: true,
    });

    let parsed: { rewritten?: string };
    try {
      parsed = JSON.parse(raw) as { rewritten?: string };
    } catch (parseError) {
      console.error("[actions/documents] rewriteResumeBullet JSON parse failed", parseError, raw.slice(0, 300));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    if (!parsed.rewritten) {
      return { success: false, error: "The AI didn't return a rewrite. Please try again." };
    }

    return { success: true, text: parsed.rewritten };
  } catch (error) {
    console.error("[actions/documents] rewriteResumeBullet", error);
    return { success: false, error: "Failed to rewrite this bullet." };
  }
}

// Style never changes what the résumé says, only how it looks — no rescore.
// Also the cover letter's own style — the two documents share one
// applications.resume_style row per job (see CoverLetterPDF.tsx's comment),
// so a style edit from either workspace revalidates both.
export async function saveResumeStyle(jobId: string, style: ResumeStyle): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("applications")
      .update({ resume_style: style, updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("job_id", jobId);

    if (error) {
      console.error("[actions/documents] saveResumeStyle", error);
      return { success: false, error: "Failed to save your style changes" };
    }

    revalidatePath(`/resume/tailored/${jobId}`);
    revalidatePath(`/cover-letter/tailored/${jobId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/documents] saveResumeStyle", error);
    return { success: false, error: "Failed to save your style changes" };
  }
}

// Cover letter's own content edit — mirrors saveResumeSections' shape/scope
// exactly: a plain DB update, no PDF re-render/re-upload (the live preview
// renders fresh from this state directly; the downloadable PDF file only
// refreshes on regenerate/AI-chat-revise, same standing behavior the
// résumé side already has). `salutation` null means "use the computed
// default" (see CoverLetterPDF.tsx).
export async function saveCoverLetterContent(
  jobId: string,
  data: { letterBody: string; salutation: string | null },
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("applications")
      .update({
        generated_cover_letter: data.letterBody,
        cover_letter_salutation: data.salutation,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("job_id", jobId);

    if (error) {
      console.error("[actions/documents] saveCoverLetterContent", error);
      return { success: false, error: "Failed to save your changes" };
    }

    revalidatePath(`/cover-letter/tailored/${jobId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/documents] saveCoverLetterContent", error);
    return { success: false, error: "Failed to save your changes" };
  }
}

// Mirrors actions/resumes.ts's deleteTailoredResume exactly (same
// shared-row caveat): a résumé and cover letter for the same job can live
// on the SAME `applications` row, so this only clears the cover-letter-
// specific columns and storage file — deleting the whole row would
// silently destroy an unrelated résumé. `resume_style` is deliberately
// left untouched even though this document used it too, since the résumé
// (if one still exists) still needs it. The row itself is only removed
// once nothing (résumé or cover letter) references it anymore.
export async function deleteTailoredCoverLetter(jobId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: application } = await insforge.database
      .from("applications")
      .select("id,cover_letter_pdf_url,generated_resume,resume_pdf_url")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<{
        id: string;
        cover_letter_pdf_url: string | null;
        generated_resume: string | null;
        resume_pdf_url: string | null;
      }>();

    if (!application) {
      return { success: false, error: "Tailored cover letter not found" };
    }

    if (application.cover_letter_pdf_url) {
      await insforge.storage.from("resumes").remove([application.cover_letter_pdf_url]);
    }

    const hasResume = Boolean(application.generated_resume || application.resume_pdf_url);

    const { error } = hasResume
      ? await insforge.database
          .from("applications")
          .update({ generated_cover_letter: null, cover_letter_pdf_url: null, cover_letter_salutation: null })
          .eq("id", application.id)
      : await insforge.database.from("applications").delete().eq("id", application.id);

    if (error) {
      console.error("[actions/documents] deleteTailoredCoverLetter", error);
      return { success: false, error: "Failed to delete this cover letter" };
    }

    revalidatePath("/resume");
    revalidatePath(`/find-jobs/${jobId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/documents] deleteTailoredCoverLetter", error);
    return { success: false, error: "Failed to delete this cover letter" };
  }
}

export type DocumentVersionRow = {
  id: string;
  kind: "resume" | "cover_letter";
  storage_path: string;
  model_used: string | null;
  created_at: string;
};

// Version manager (direct user report — regenerating a résumé/cover letter
// for a job used to silently overwrite the only copy, no way back). Each
// row here is a real archived version, created automatically right before
// a regenerate or restore overwrites what was live (lib/documentPersistence.ts's
// archiveCurrentDocument) — newest first, since that's what a "history"
// panel actually wants to show.
export async function listDocumentVersions(
  jobId: string,
  kind: "resume" | "cover_letter",
): Promise<DocumentVersionRow[]> {
  const user = await requireUser();

  const insforge = await createInsforgeServer();
  const { data, error } = await insforge.database
    .from("document_versions")
    .select("id,kind,storage_path,model_used,created_at")
    .eq("user_id", user.id)
    .eq("job_id", jobId)
    .eq("kind", kind)
    .order("created_at", { ascending: false })
    .returns<DocumentVersionRow[]>();

  if (error) {
    console.error("[actions/documents] listDocumentVersions", error);
    return [];
  }
  return data ?? [];
}

// Restores an archived version as the new current document. Archives
// whatever's CURRENTLY live first (same archiveCurrentDocument step a fresh
// generate uses) — restoring an old version doesn't destroy the one it's
// replacing, it just becomes the next entry in the same history.
export async function restoreDocumentVersion(
  versionId: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: version } = await insforge.database
      .from("document_versions")
      .select("id,job_id,kind,storage_path,content_text,resume_sections,resume_style,model_used")
      .eq("id", versionId)
      .eq("user_id", user.id)
      .maybeSingle<{
        id: string;
        job_id: string;
        kind: "resume" | "cover_letter";
        storage_path: string;
        content_text: string | null;
        resume_sections: ResumeSection[] | null;
        resume_style: ResumeStyle | null;
        model_used: string | null;
      }>();

    if (!version) {
      return { success: false, error: "Version not found" };
    }

    const { data: existingApplication } = await insforge.database
      .from("applications")
      .select(
        "id,generated_resume,generated_cover_letter,resume_pdf_url,cover_letter_pdf_url,resume_sections,resume_style,ai_model_used",
      )
      .eq("user_id", user.id)
      .eq("job_id", version.job_id)
      .maybeSingle<{
        id: string;
        generated_resume: string | null;
        generated_cover_letter: string | null;
        resume_pdf_url: string | null;
        cover_letter_pdf_url: string | null;
        resume_sections: ResumeSection[] | null;
        resume_style: ResumeStyle | null;
        ai_model_used: string | null;
      }>();

    await archiveCurrentDocument(insforge, existingApplication ?? null, version.kind, user.id, version.job_id);

    const { data: versionBlob, error: downloadError } = await insforge.storage
      .from("resumes")
      .download(version.storage_path);
    if (downloadError || !versionBlob) {
      console.error("[actions/documents] restoreDocumentVersion download", downloadError);
      return { success: false, error: "Failed to load this version's file" };
    }

    const liveStoragePath = `${user.id}/${version.job_id}/${version.kind === "resume" ? "resume" : "cover-letter"}.pdf`;
    await insforge.storage.from("resumes").remove([liveStoragePath]);
    const { error: uploadError } = await insforge.storage.from("resumes").upload(liveStoragePath, versionBlob);
    if (uploadError) {
      console.error("[actions/documents] restoreDocumentVersion upload", uploadError);
      return { success: false, error: "Failed to restore this version" };
    }

    const documentColumn = version.kind === "resume" ? "generated_resume" : "generated_cover_letter";
    const urlColumn = version.kind === "resume" ? "resume_pdf_url" : "cover_letter_pdf_url";
    const restorePatch: Record<string, unknown> = {
      [documentColumn]: version.content_text,
      [urlColumn]: liveStoragePath,
      ai_model_used: version.model_used,
      status: "generated",
    };
    if (version.kind === "resume") {
      restorePatch.resume_sections = version.resume_sections;
      restorePatch.resume_style = version.resume_style;
    }

    const { error: patchError } = existingApplication
      ? await insforge.database.from("applications").update(restorePatch).eq("id", existingApplication.id)
      : await insforge.database.from("applications").insert([{ user_id: user.id, job_id: version.job_id, ...restorePatch }]);

    if (patchError) {
      console.error("[actions/documents] restoreDocumentVersion patch", patchError);
      return { success: false, error: "Failed to restore this version" };
    }

    revalidatePath(`/find-jobs/${version.job_id}`);
    revalidatePath(`/resume/tailored/${version.job_id}`);
    revalidatePath(`/cover-letter/tailored/${version.job_id}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/documents] restoreDocumentVersion", error);
    return { success: false, error: "Failed to restore this version" };
  }
}
