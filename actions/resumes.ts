"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { resolveProvider } from "@/lib/access";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { complete, getModel } from "@/lib/models";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkAndConsumeUsage } from "@/lib/usage";
import { isFeatureEnabled, featureDisabledMessage } from "@/lib/features";
import { extractProfileFromBuffer, type ExtractedProfile } from "@/actions/profile";
import { SYNC_SECTIONS, type SyncSection } from "@/lib/resumeSync";
import type { Profile, ResumeAnalysis, ResumeIssueSeverity } from "@/types";

// Real backend for the /preview/resume mockup's résumé manager. Scoped
// deliberately: CRUD + résumé→profile sync (additive merge, never
// destructive) are real and wired end-to-end. "Update from profile" (the
// bi-directional AI merge that preserves an existing tailored résumé's
// layout) and job-page persona recommendations are NOT built here — both
// depend on the document-engine refactor (build-action-plan-2026-07-28.md
// Phase 1.2) and the existing per-job tailoring pipeline
// (app/api/resume/generate/route.tsx), which is a separate, larger piece of
// work than this table/CRUD layer.
const MAX_RESUME_SLOTS = 5;

export type ResumeRow = {
  id: string;
  name: string;
  persona: string | null;
  target_job_title: string | null;
  storage_path: string;
  is_primary: boolean;
  status: "uploaded" | "analysed";
  extracted_data: ExtractedProfile | null;
  analysis: ResumeAnalysis | null;
  analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

const RESUME_COLUMNS =
  "id,name,persona,target_job_title,storage_path,is_primary,status,extracted_data,analysis,analyzed_at,created_at,updated_at";

export async function listResumes(): Promise<{
  success: boolean;
  data?: ResumeRow[];
  error?: string;
}> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const { data, error } = await insforge.database
      .from("resumes")
      .select(RESUME_COLUMNS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[actions/resumes] listResumes", error);
      return { success: false, error: "Failed to load résumés" };
    }

    return { success: true, data: (data ?? []) as unknown as ResumeRow[] };
  } catch (error) {
    console.error("[actions/resumes] listResumes", error);
    return { success: false, error: "Failed to load résumés" };
  }
}

export async function uploadResumeSlot(
  formData: FormData,
): Promise<{ success: boolean; data?: ResumeRow; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const file = formData.get("resume");
    if (!(file instanceof File)) {
      return { success: false, error: "No file provided" };
    }
    if (file.type !== "application/pdf") {
      return { success: false, error: "File must be a PDF" };
    }
    if (file.size > 2 * 1024 * 1024) {
      return { success: false, error: "File must be under 2MB" };
    }

    const { data: existingResumes, error: countError } = await insforge.database
      .from("resumes")
      .select("id,is_primary")
      .eq("user_id", user.id);

    if (countError) {
      console.error("[actions/resumes] uploadResumeSlot count", countError);
      return { success: false, error: "Failed to check résumé slots" };
    }

    const currentCount = existingResumes?.length ?? 0;
    if (currentCount >= MAX_RESUME_SLOTS) {
      return {
        success: false,
        error: `You've used all ${MAX_RESUME_SLOTS} résumé slots — delete one first.`,
      };
    }

    const id = randomUUID();
    const storagePath = `${user.id}/resumes/${id}.pdf`;

    const { error: uploadError } = await insforge.storage.from("resumes").upload(storagePath, file);
    if (uploadError) {
      console.error("[actions/resumes] uploadResumeSlot storage", uploadError);
      return { success: false, error: "Failed to upload résumé" };
    }

    // Best-effort auto-extraction — a failure here (rate limit, transient AI
    // error) shouldn't lose the upload itself, just leave it unanalysed
    // (status stays "uploaded"; Sync to Profile is unavailable until it
    // succeeds, same as the single-résumé flow's existing "Extract Profile"
    // button already communicates).
    let extractedData: ExtractedProfile | null = null;
    let status: ResumeRow["status"] = "uploaded";

    if (isFeatureEnabled("resume_extract")) {
      const rateLimit = await checkRateLimit(insforge, user.id, user.email, "resumes/upload");
      const usage = rateLimit.allowed
        ? await checkAndConsumeUsage(insforge, user.id, user.email, "resume_extract")
        : null;

      if (rateLimit.allowed && usage?.allowed) {
        try {
          const arrayBuffer = await file.arrayBuffer();
          const { data: profileRow } = await insforge.database
            .from("profiles")
            .select("preferred_model")
            .eq("id", user.id)
            .maybeSingle<Pick<Profile, "preferred_model">>();

          const extraction = await extractProfileFromBuffer(
            Buffer.from(arrayBuffer),
            profileRow?.preferred_model ?? null,
            user.email,
          );
          if (extraction.success && extraction.data) {
            extractedData = extraction.data;
            status = "analysed";
          }
        } catch (extractError) {
          console.error("[actions/resumes] uploadResumeSlot extraction", extractError);
        }
      }
    }

    const isPrimary = currentCount === 0;
    const name = file.name.replace(/\.pdf$/i, "");

    const { data: inserted, error: insertError } = await insforge.database
      .from("resumes")
      .insert([
        {
          id,
          user_id: user.id,
          name,
          persona: null,
          target_job_title: null,
          storage_path: storagePath,
          is_primary: isPrimary,
          status,
          extracted_data: extractedData,
        },
      ])
      .select(RESUME_COLUMNS)
      .maybeSingle();

    if (insertError || !inserted) {
      console.error("[actions/resumes] uploadResumeSlot insert", insertError);
      // Storage file was written but the DB row wasn't — clean up rather
      // than leave an orphaned, unreferenced file in the bucket.
      await insforge.storage.from("resumes").remove(storagePath);
      return { success: false, error: "Failed to save résumé" };
    }

    let result = inserted as unknown as ResumeRow;

    // Best-effort, same pattern as extraction above — if quality analysis
    // fails (rate limit, daily cap already spent) the upload itself still
    // succeeds, just lands in the "not yet analyzed" state the détail page
    // already handles, same as before this résumé was auto-analyzed at all.
    if (extractedData) {
      try {
        const analysisResult = await analyzeResume(id);
        if (analysisResult.success && analysisResult.analysis) {
          result = { ...result, analysis: analysisResult.analysis, analyzed_at: new Date().toISOString() };
        }
      } catch (analysisError) {
        console.error("[actions/resumes] uploadResumeSlot auto-analyze", analysisError);
      }
    }

    revalidatePath("/profile");
    return { success: true, data: result };
  } catch (error) {
    console.error("[actions/resumes] uploadResumeSlot", error);
    return { success: false, error: "Failed to upload résumé" };
  }
}

export async function renameResume(
  id: string,
  fields: { name?: string; persona?: string | null; targetJobTitle?: string | null },
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (fields.name !== undefined) update.name = fields.name;
    if (fields.persona !== undefined) update.persona = fields.persona;
    if (fields.targetJobTitle !== undefined) update.target_job_title = fields.targetJobTitle;

    const { error } = await insforge.database
      .from("resumes")
      .update(update)
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumes] renameResume", error);
      return { success: false, error: "Failed to update résumé" };
    }

    revalidatePath("/profile");
    revalidatePath("/resume");
    revalidatePath(`/resume/${id}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] renameResume", error);
    return { success: false, error: "Failed to update résumé" };
  }
}

export async function setPrimaryResume(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    // Unset the old primary first — the partial unique index on
    // resumes(user_id) WHERE is_primary would reject setting a second one
    // true before the first is cleared.
    const { error: unsetError } = await insforge.database
      .from("resumes")
      .update({ is_primary: false })
      .eq("user_id", user.id)
      .eq("is_primary", true);

    if (unsetError) {
      console.error("[actions/resumes] setPrimaryResume unset", unsetError);
      return { success: false, error: "Failed to update primary résumé" };
    }

    const { error: setError } = await insforge.database
      .from("resumes")
      .update({ is_primary: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (setError) {
      console.error("[actions/resumes] setPrimaryResume set", setError);
      return { success: false, error: "Failed to update primary résumé" };
    }

    revalidatePath("/profile");
    revalidatePath("/resume");
    revalidatePath(`/resume/${id}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] setPrimaryResume", error);
    return { success: false, error: "Failed to update primary résumé" };
  }
}

export async function deleteResume(id: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: resumes, error: fetchError } = await insforge.database
      .from("resumes")
      .select("id,is_primary,storage_path")
      .eq("user_id", user.id);

    if (fetchError) {
      console.error("[actions/resumes] deleteResume fetch", fetchError);
      return { success: false, error: "Failed to delete résumé" };
    }

    const target = (resumes ?? []).find((r) => r.id === id) as
      | { id: string; is_primary: boolean; storage_path: string }
      | undefined;

    if (!target) {
      return { success: false, error: "Résumé not found" };
    }

    if (target.is_primary && (resumes?.length ?? 0) > 1) {
      return {
        success: false,
        error: "Set another résumé as primary before deleting this one.",
      };
    }

    const { error: deleteError } = await insforge.database
      .from("resumes")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("[actions/resumes] deleteResume", deleteError);
      return { success: false, error: "Failed to delete résumé" };
    }

    // Best-effort — the DB row is the source of truth for "this résumé is
    // gone"; a leftover orphaned file is a cleanup nit, not a correctness
    // issue for the user.
    await insforge.storage.from("resumes").remove(target.storage_path);

    revalidatePath("/profile");
    revalidatePath("/resume");
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] deleteResume", error);
    return { success: false, error: "Failed to delete résumé" };
  }
}

export type SectionDiff = { section: SyncSection; hasChanges: boolean; summary: string[] };

function diffSection(section: SyncSection, current: Profile, extracted: ExtractedProfile): SectionDiff {
  const summary: string[] = [];

  if (section === "Personal") {
    if (extracted.full_name && extracted.full_name !== current.full_name) {
      summary.push(`Name: "${current.full_name ?? "—"}" → "${extracted.full_name}"`);
    }
    if (extracted.phone && extracted.phone !== current.phone) {
      summary.push(`Phone: "${current.phone ?? "—"}" → "${extracted.phone}"`);
    }
    if (extracted.location && extracted.location !== current.location) {
      summary.push(`Location: "${current.location ?? "—"}" → "${extracted.location}"`);
    }
    if (extracted.linkedin_url && extracted.linkedin_url !== current.linkedin_url) {
      summary.push("LinkedIn URL updated");
    }
    if (extracted.portfolio_url && extracted.portfolio_url !== current.portfolio_url) {
      summary.push("Portfolio URL updated");
    }
  }

  if (section === "Professional") {
    if (extracted.current_title && extracted.current_title !== current.current_title) {
      summary.push(`Title: "${current.current_title ?? "—"}" → "${extracted.current_title}"`);
    }
    if (extracted.experience_level && extracted.experience_level !== current.experience_level) {
      summary.push(`Experience level: "${current.experience_level ?? "—"}" → "${extracted.experience_level}"`);
    }
    if (extracted.years_experience != null && extracted.years_experience !== current.years_experience) {
      summary.push(`Years experience: ${current.years_experience ?? "—"} → ${extracted.years_experience}`);
    }
    extracted.skills
      .filter((s) => !(current.skills ?? []).includes(s))
      .forEach((s) => summary.push(`+ Skill: ${s}`));
    extracted.industries
      .filter((i) => !(current.industries ?? []).includes(i))
      .forEach((i) => summary.push(`+ Industry: ${i}`));
  }

  if (section === "Education") {
    const existingKeys = new Set((current.education ?? []).map((e) => `${e.institution}|${e.degree}`));
    extracted.education
      .filter((e) => !existingKeys.has(`${e.institution}|${e.degree}`))
      .forEach((e) => summary.push(`+ ${e.degree ?? "Degree"} — ${e.institution ?? "Institution"}`));
  }

  if (section === "Certifications") {
    extracted.certifications
      .filter((c) => !(current.certifications ?? []).includes(c))
      .forEach((c) => summary.push(`+ ${c}`));
  }

  if (section === "Work Experience") {
    const existingKeys = new Set((current.work_experience ?? []).map((w) => `${w.company}|${w.title}`));
    extracted.work_experience
      .filter((w) => !existingKeys.has(`${w.company}|${w.title}`))
      .forEach((w) => summary.push(`+ ${w.title} at ${w.company}`));
  }

  if (section === "Preferences") {
    extracted.job_titles_seeking
      .filter((t) => !(current.job_titles_seeking ?? []).includes(t))
      .forEach((t) => summary.push(`+ Seeking: ${t}`));
  }

  return { section, hasChanges: summary.length > 0, summary };
}

export async function getResumeProfileDiff(
  resumeId: string,
): Promise<{ success: boolean; diffs?: SectionDiff[]; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("extracted_data")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle<{ extracted_data: ExtractedProfile | null }>();

    if (!resume?.extracted_data) {
      return { success: false, error: "This résumé hasn't been analysed yet." };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (!profile) {
      return { success: false, error: "Profile not found." };
    }

    const diffs = SYNC_SECTIONS.map((section) => diffSection(section, profile, resume.extracted_data!));
    return { success: true, diffs };
  } catch (error) {
    console.error("[actions/resumes] getResumeProfileDiff", error);
    return { success: false, error: "Failed to compare résumé to profile" };
  }
}

// Case/whitespace-insensitive dedup key — Gemini extraction isn't perfectly
// consistent run-to-run on casing (confirmed live: the same "Wizcraft" entry
// came back as "wizcraft" on a later extraction), and a case-sensitive
// key silently treated that as a different company, appending a duplicate
// entry instead of recognizing it as already-synced.
function dedupeKey(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p ?? "").trim().toLowerCase()).join("|");
}

// Additive merge only — a section sync never removes or overwrites an
// existing entry, it only adds what's in the résumé but genuinely missing
// from the profile. A destructive overwrite would contradict the "nothing
// else is touched" promise the sync modal makes, and risks silently
// deleting hand-edited profile content just because one résumé's PDF
// happened not to mention it.
export async function syncResumeToProfile(
  resumeId: string,
  sections: SyncSection[],
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("extracted_data")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle<{ extracted_data: ExtractedProfile | null }>();

    if (!resume?.extracted_data) {
      return { success: false, error: "This résumé hasn't been analysed yet." };
    }
    const extracted = resume.extracted_data;

    const { data: current } = await insforge.database
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle<Profile>();

    if (!current) {
      return { success: false, error: "Profile not found." };
    }

    const fields: Record<string, unknown> = {};

    if (sections.includes("Personal")) {
      if (extracted.full_name) fields.full_name = extracted.full_name;
      if (extracted.phone) fields.phone = extracted.phone;
      if (extracted.location) fields.location = extracted.location;
      if (extracted.linkedin_url) fields.linkedin_url = extracted.linkedin_url;
      if (extracted.portfolio_url) fields.portfolio_url = extracted.portfolio_url;
    }

    if (sections.includes("Professional")) {
      if (extracted.current_title) fields.current_title = extracted.current_title;
      if (extracted.experience_level) fields.experience_level = extracted.experience_level;
      if (extracted.years_experience != null) fields.years_experience = extracted.years_experience;
      fields.skills = Array.from(new Set([...(current.skills ?? []), ...extracted.skills]));
      fields.industries = Array.from(new Set([...(current.industries ?? []), ...extracted.industries]));
    }

    if (sections.includes("Education")) {
      const existingKeys = new Set(
        (current.education ?? []).map((e) => dedupeKey(e.institution, e.degree)),
      );
      fields.education = [
        ...(current.education ?? []),
        ...extracted.education.filter((e) => !existingKeys.has(dedupeKey(e.institution, e.degree))),
      ];
    }

    if (sections.includes("Certifications")) {
      fields.certifications = Array.from(new Set([...(current.certifications ?? []), ...extracted.certifications]));
    }

    if (sections.includes("Work Experience")) {
      const existingKeys = new Set(
        (current.work_experience ?? []).map((w) => dedupeKey(w.company, w.title)),
      );
      fields.work_experience = [
        ...(current.work_experience ?? []),
        ...extracted.work_experience.filter((w) => !existingKeys.has(dedupeKey(w.company, w.title))),
      ];
    }

    if (sections.includes("Preferences")) {
      fields.job_titles_seeking = Array.from(
        new Set([...(current.job_titles_seeking ?? []), ...extracted.job_titles_seeking]),
      );
    }

    if (Object.keys(fields).length === 0) {
      return { success: true };
    }

    const { error } = await insforge.database.from("profiles").update(fields).eq("id", user.id);

    if (error) {
      console.error("[actions/resumes] syncResumeToProfile", error);
      return { success: false, error: "Failed to sync into profile" };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] syncResumeToProfile", error);
    return { success: false, error: "Failed to sync into profile" };
  }
}

// One structured Gemini call covers all three lenses (10-dimension role-fit
// matrix, strategic narrative alignment, interviewer-skepticism
// vulnerabilities) rather than three separate calls — triples the cost for
// no real benefit, and a single pass can cross-reference the lenses against
// each other (e.g. a vulnerability the narrative insight also touches on).
// See the chat flow-design pass and context/jobright-resume-scan-2026-07-30.md
// for why the report is shaped this way, and lib/usage.ts's comment on
// resume_quality_analysis for why the cap is tight (3/day) relative to
// bullet_rewrite.
export async function analyzeResume(
  resumeId: string,
): Promise<{ success: boolean; analysis?: ResumeAnalysis; error?: string }> {
  if (!isFeatureEnabled("resume_quality_analysis")) {
    return { success: false, error: featureDisabledMessage("resume_quality_analysis") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "resumes/analyze");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("target_job_title,extracted_data")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle<{ target_job_title: string | null; extracted_data: ExtractedProfile | null }>();

    if (!resume?.extracted_data) {
      return { success: false, error: "This résumé hasn't been analysed yet — upload or sync it first." };
    }
    const extracted = resume.extracted_data;

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "resume_quality_analysis");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: profileRow } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    const targetRole = resume.target_job_title || extracted.current_title || extracted.job_titles_seeking[0] || "the role this résumé targets";

    const résuméText = `
Target role: ${targetRole}
Current title: ${extracted.current_title ?? "—"} (${extracted.experience_level ?? "—"}, ${extracted.years_experience ?? "—"} years)
Skills: ${extracted.skills.join(", ") || "—"}
Industries: ${extracted.industries.join(", ") || "—"}

Work Experience:
${extracted.work_experience
  .map(
    (w) =>
      `- ${w.company} | ${w.title} | ${w.start_date} to ${w.is_current ? "Present" : w.end_date ?? "—"}\n  ${w.responsibilities || "(no description)"}`,
  )
  .join("\n")}

Education:
${extracted.education.map((e) => `- ${e.degree ?? "—"} in ${e.field ?? "—"}, ${e.institution ?? "—"} (${e.graduation_year ?? "—"})`).join("\n")}

Certifications: ${extracted.certifications?.join(", ") || "—"}
`.trim();

    const raw = await complete(getModel(resolveProvider(profileRow?.preferred_model, user.email), "smart"), {
      systemPrompt:
        "You are an expert résumé reviewer combining three lenses into one report. (1) A 10-DIMENSION ROLE-FIT MATRIX scoped specifically to the target role (pick 10 dimensions that actually matter for THIS role — e.g. for an engineering role: Technical Depth, System Design, Ownership & Scope, Collaboration, Impact Quantification, etc.; for a sales role the dimensions would be entirely different — do not use a generic template). Each dimension gets a letter grade (A-F) and a one-sentence reason grounded in the actual résumé text. (2) STRATEGIC NARRATIVE ALIGNMENT: read the whole résumé holistically and identify what career narrative it currently tells (e.g. 'individual contributor executor' vs 'team lead' vs 'strategic owner') versus what the target role likely expects — one paragraph. (3) INTERVIEWER SKEPTICISM: identify 2-4 specific things a sharp interviewer would probe or doubt (unexplained gaps, vague claims, seniority mismatches) — frame these as 'expect to be asked about this,' not as résumé-editing issues. Separately, identify concrete PER-BULLET issues in the work experience section only (not every bullet needs one — skip bullets that are already strong) with severity urgent/critical/optional, matched to the EXACT original bullet text so it can be found again. For each flagged bullet, also write a suggested rewrite. Only use information that is actually stated or clearly implied in the résumé — never invent metrics, employers, or outcomes. Return only valid JSON matching the exact schema given.",
      userPrompt: `Résumé to analyze:\n\n${résuméText}\n\nReturn JSON with this exact shape:
{
  "grade": "A"|"B"|"C"|"D"|"F",
  "gradeLabel": "Excellent"|"Good"|"Satisfactory"|"Improvable",
  "summary": string,
  "dimensions": [{ "dimension": string, "grade": "A"|"B"|"C"|"D"|"F", "note": string }],
  "narrativeInsight": string,
  "vulnerabilities": [{ "title": string, "description": string }],
  "sections": [
    {
      "section": "personal"|"professional_summary"|"skills"|"work_experience"|"education",
      "entryCompany": string (only for work_experience, must exactly match one of the company names above),
      "severity": "urgent"|"critical"|"optional",
      "bulletIssues": [
        {
          "originalText": string (must exactly match a substring of that entry's description above),
          "issueType": string,
          "issueDetected": string,
          "whyItMatters": string,
          "howToImprove": string,
          "suggestedRewrite": string
        }
      ]
    }
  ]
}
Provide exactly 10 dimensions. "sections" should only include sections that actually have issues — omit clean ones entirely.`,
      temperature: 0.4,
      maxTokens: 4000,
      jsonResponse: true,
    });

    let parsed: Omit<ResumeAnalysis, "urgentCount" | "criticalCount" | "optionalCount">;
    try {
      parsed = JSON.parse(raw);
    } catch (parseError) {
      console.error("[actions/resumes] analyzeResume JSON parse failed", parseError, raw.slice(0, 500));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    // Counts are derived here, not trusted from the model — keeps the
    // top-level badge always internally consistent with what's actually in
    // `sections`, even if the model's own arithmetic is off.
    const countBy = (severity: ResumeIssueSeverity) =>
      parsed.sections.filter((s) => s.severity === severity).length;

    const analysis: ResumeAnalysis = {
      grade: parsed.grade,
      gradeLabel: parsed.gradeLabel,
      summary: parsed.summary,
      dimensions: parsed.dimensions,
      narrativeInsight: parsed.narrativeInsight,
      vulnerabilities: parsed.vulnerabilities ?? [],
      sections: parsed.sections ?? [],
      urgentCount: countBy("urgent"),
      criticalCount: countBy("critical"),
      optionalCount: countBy("optional"),
    };

    const { error } = await insforge.database
      .from("resumes")
      .update({ analysis, analyzed_at: new Date().toISOString() })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumes] analyzeResume db", error);
      return { success: false, error: "Failed to save analysis" };
    }

    // Both paths, not just the list — "/resume" alone left the détail page
    // (app/resume/[id]) serving a stale cached render even after a
    // successful re-analysis, since Next.js only invalidates the exact path
    // given to revalidatePath, not the whole /resume/* subtree.
    revalidatePath("/resume");
    revalidatePath(`/resume/${resumeId}`);
    return { success: true, analysis };
  } catch (error) {
    console.error("[actions/resumes] analyzeResume", error);
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("429") || /quota|rate limit/i.test(message)) {
      return { success: false, error: "The AI service is rate-limited right now. Please wait a minute and try again." };
    }
    return { success: false, error: "Failed to analyze this résumé." };
  }
}

// Applies one flagged bullet's suggested rewrite directly into the résumé's
// own extracted_data (self-contained — this résumé slot's data, not the
// live profile). Re-finds the entry by company (stable) and the bullet by
// exact original text (also stable, since this is called with the same
// snapshot the analysis was run against).
export async function applyResumeBulletFix(
  resumeId: string,
  entryCompany: string,
  originalText: string,
  newText: string,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: resume } = await insforge.database
      .from("resumes")
      .select("extracted_data")
      .eq("id", resumeId)
      .eq("user_id", user.id)
      .maybeSingle<{ extracted_data: ExtractedProfile | null }>();

    if (!resume?.extracted_data) {
      return { success: false, error: "Résumé not found" };
    }

    const extracted = resume.extracted_data;
    const entry = extracted.work_experience.find((w) => w.company === entryCompany);
    if (!entry) {
      return { success: false, error: "That work experience entry was not found" };
    }

    if (!entry.responsibilities.includes(originalText)) {
      return { success: false, error: "That bullet has already changed — refresh the analysis to try again." };
    }

    entry.responsibilities = entry.responsibilities.replace(originalText, newText);

    const { error } = await insforge.database
      .from("resumes")
      .update({ extracted_data: extracted })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumes] applyResumeBulletFix db", error);
      return { success: false, error: "Failed to save this change" };
    }

    revalidatePath("/resume");
    revalidatePath(`/resume/${resumeId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] applyResumeBulletFix", error);
    return { success: false, error: "Failed to save this change" };
  }
}
