"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";

import { resolveModelForUser } from "@/lib/subscription";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { checkRateLimit } from "@/lib/rateLimit";
import { checkAndConsumeUsage } from "@/lib/usage";
import { isFeatureEnabled, featureDisabledMessage } from "@/lib/features";
import { runResumeQualityAnalysis } from "@/lib/resumeQuality";
import { extractProfileFromBuffer, type ExtractedProfile } from "@/actions/profile";
import { SYNC_SECTIONS, type SyncSection } from "@/lib/resumeSync";
import { complete, getModel } from "@/lib/models";
import { BULLET_QUALITY_RULES, HUMANIZED_WRITING_RULES } from "@/lib/writingStyle";
import type { Profile, ResumeAnalysis } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

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
            insforge,
            user.id,
            user.email ?? "",
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
      await insforge.storage.from("resumes").remove([storagePath]);
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
    await insforge.storage.from("resumes").remove([target.storage_path]);

    revalidatePath("/profile");
    revalidatePath("/resume");
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] deleteResume", error);
    return { success: false, error: "Failed to delete résumé" };
  }
}

// AI-tailored-per-job résumés aren't rows in the `resumes` table above —
// they're the `generated_resume`/`resume_pdf_url` columns on that job's
// `applications` row (see lib/documentPersistence.ts). A cover letter for
// the same job can share that row, so this only clears the résumé-specific
// columns and storage file — deleting the whole row would silently destroy
// an unrelated cover letter. The row itself is only removed once nothing
// (résumé or cover letter) references it anymore.
export async function deleteTailoredResume(jobId: string): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { data: application } = await insforge.database
      .from("applications")
      .select("id,resume_pdf_url,cover_letter_pdf_url,generated_cover_letter")
      .eq("user_id", user.id)
      .eq("job_id", jobId)
      .maybeSingle<{
        id: string;
        resume_pdf_url: string | null;
        cover_letter_pdf_url: string | null;
        generated_cover_letter: string | null;
      }>();

    if (!application) {
      return { success: false, error: "Tailored résumé not found" };
    }

    if (application.resume_pdf_url) {
      await insforge.storage.from("resumes").remove([application.resume_pdf_url]);
    }

    const hasCoverLetter = Boolean(application.cover_letter_pdf_url || application.generated_cover_letter);

    const { error } = hasCoverLetter
      ? await insforge.database
          .from("applications")
          .update({ generated_resume: null, resume_pdf_url: null })
          .eq("id", application.id)
      : await insforge.database.from("applications").delete().eq("id", application.id);

    if (error) {
      console.error("[actions/resumes] deleteTailoredResume", error);
      return { success: false, error: "Failed to delete this tailored résumé" };
    }

    revalidatePath("/resume");
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] deleteTailoredResume", error);
    return { success: false, error: "Failed to delete this tailored résumé" };
  }
}

// A matched entry (same company+title, or same institution+degree) whose
// content has drifted from what's in the profile — e.g. a fresh extraction
// has an updated end date/responsibilities, or the original sync happened
// before a data-quality fix. Surfaced separately from `summary`'s pure
// additions because applying one is destructive (replaces existing content)
// and needs its own explicit per-entry opt-in, not just the section-level
// checkbox additions already get.
export type ReplacementCandidate = { key: string; label: string; current: string; proposed: string };

export type SectionDiff = {
  section: SyncSection;
  hasChanges: boolean;
  summary: string[];
  replacements: ReplacementCandidate[];
};

function diffSection(section: SyncSection, current: Profile, extracted: ExtractedProfile): SectionDiff {
  const summary: string[] = [];
  const replacements: ReplacementCandidate[] = [];

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
    // dedupeKey, not raw template-string keys — a case/whitespace mismatch
    // here would show an entry as "new" in this preview while the real sync
    // (which already uses dedupeKey) treats it as an existing match, so the
    // two would disagree about what's actually about to happen.
    const existingByKey = new Map((current.education ?? []).map((e) => [dedupeKey(e.institution, e.degree), e]));
    extracted.education.forEach((e) => {
      const key = dedupeKey(e.institution, e.degree);
      const match = existingByKey.get(key);
      if (!match) {
        summary.push(`+ ${e.degree ?? "Degree"} — ${e.institution ?? "Institution"}`);
        return;
      }
      const fieldChanged = (e.field ?? "") !== (match.field ?? "");
      const yearChanged = (e.graduation_year ?? "") !== (match.graduation_year ?? "");
      if (fieldChanged || yearChanged) {
        replacements.push({
          key,
          label: `${e.degree ?? "Degree"} — ${e.institution ?? "Institution"}`,
          current: `${match.field ?? "—"} · ${match.graduation_year ?? "—"}`,
          proposed: `${e.field ?? "—"} · ${e.graduation_year ?? "—"}`,
        });
      }
    });
  }

  if (section === "Certifications") {
    extracted.certifications
      .filter((c) => !(current.certifications ?? []).includes(c))
      .forEach((c) => summary.push(`+ ${c}`));
  }

  if (section === "Work Experience") {
    // Keyed on start_date, NOT company/title text — confirmed live (real
    // user data) that two extractions of the SAME job can disagree on both:
    // one résumé said "HCL Technologies" / "Full-stack Developer", another
    // said "HCL America Inc" / "Developer", for a position that started the
    // same month either way. A company/title key treated those as two
    // different jobs and silently appended a duplicate; start_date is the
    // one field extraction has actually been consistent on across résumé
    // versions, so it's a far more reliable "is this the same job" signal
    // than paraphrased company/title strings.
    const existingByKey = new Map((current.work_experience ?? []).map((w) => [dedupeKey(w.start_date), w]));
    extracted.work_experience.forEach((w) => {
      const key = dedupeKey(w.start_date);
      const match = existingByKey.get(key);
      if (!match) {
        summary.push(`+ ${w.title} at ${w.company}`);
        return;
      }
      const companyChanged = dedupeKey(w.company) !== dedupeKey(match.company);
      const titleChanged = dedupeKey(w.title) !== dedupeKey(match.title);
      const responsibilitiesChanged = w.responsibilities.trim() !== (match.responsibilities ?? "").trim();
      const endDateChanged = (w.end_date ?? "") !== (match.end_date ?? "") || w.is_current !== match.is_current;
      if (companyChanged || titleChanged || responsibilitiesChanged || endDateChanged) {
        // Company/title shown here too, not just responsibilities — since
        // the match itself can now pair entries with different company/title
        // wording, the user needs to see both sides to confirm this really
        // is the same job before approving the replacement.
        replacements.push({
          key,
          label: `Position starting ${w.start_date}`,
          current: `${match.title} at ${match.company}\n${match.responsibilities || "(no description)"}`,
          proposed: `${w.title} at ${w.company}\n${w.responsibilities || "(no description)"}`,
        });
      }
    });
  }

  if (section === "Preferences") {
    extracted.job_titles_seeking
      .filter((t) => !(current.job_titles_seeking ?? []).includes(t))
      .forEach((t) => summary.push(`+ Seeking: ${t}`));
  }

  return { section, hasChanges: summary.length > 0 || replacements.length > 0, summary, replacements };
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

// Additive by default — a section sync never removes or silently overwrites
// an existing entry, it only adds what's in the résumé but genuinely missing
// from the profile. The one exception is `replaceKeys`: an explicit,
// per-entry opt-in (surfaced by getResumeProfileDiff's `replacements` list
// and approved one-by-one in the sync modal) for Education/Work Experience
// entries that matched an existing entry but whose content has drifted —
// this is the "upgrade an existing entry, don't just add" path. Without an
// explicit key in `replaceKeys`, a matched entry is left exactly as-is, same
// as before.
export async function syncResumeToProfile(
  resumeId: string,
  sections: SyncSection[],
  replaceKeys: Partial<Record<SyncSection, string[]>> = {},
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
      const approvedReplace = new Set(replaceKeys["Education"] ?? []);
      const extractedByKey = new Map(extracted.education.map((e) => [dedupeKey(e.institution, e.degree), e]));
      const existingKeys = new Set(
        (current.education ?? []).map((e) => dedupeKey(e.institution, e.degree)),
      );
      fields.education = [
        ...(current.education ?? []).map((e) => {
          const key = dedupeKey(e.institution, e.degree);
          return approvedReplace.has(key) ? (extractedByKey.get(key) ?? e) : e;
        }),
        ...extracted.education.filter((e) => !existingKeys.has(dedupeKey(e.institution, e.degree))),
      ];
    }

    if (sections.includes("Certifications")) {
      fields.certifications = Array.from(new Set([...(current.certifications ?? []), ...extracted.certifications]));
    }

    if (sections.includes("Work Experience")) {
      // Keyed on start_date — must match diffSection's matching exactly, or
      // a key the diff showed the user as "replace this" won't be found
      // here and would silently fall through to append-as-new instead.
      const approvedReplace = new Set(replaceKeys["Work Experience"] ?? []);
      const extractedByKey = new Map(extracted.work_experience.map((w) => [dedupeKey(w.start_date), w]));
      const existingKeys = new Set((current.work_experience ?? []).map((w) => dedupeKey(w.start_date)));
      fields.work_experience = [
        ...(current.work_experience ?? []).map((w) => {
          const key = dedupeKey(w.start_date);
          return approvedReplace.has(key) ? (extractedByKey.get(key) ?? w) : w;
        }),
        ...extracted.work_experience.filter((w) => !existingKeys.has(dedupeKey(w.start_date))),
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

    const { provider, tier } = await resolveModelForUser(insforge, user.id, user.email, profileRow?.preferred_model);
    const result = await runResumeQualityAnalysis(provider, tier, résuméText);
    if (!result.success || !result.analysis) {
      return { success: false, error: result.error };
    }
    const analysis = result.analysis;

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
    // The AI call itself (429/quota included) is handled inside
    // runResumeQualityAnalysis and returns {success:false, error} rather
    // than throwing — anything reaching this catch is a DB/infra failure.
    console.error("[actions/resumes] analyzeResume", error);
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

// Gives an uploaded résumé slot the same independent-snapshot editing
// workspace a tailored per-job résumé already has — mirrors
// actions/documents.ts's saveResumeSections exactly, minus the rescore
// (there's no target job to rescore a résumé slot against). Editing this
// never touches extracted_data, which stays the raw extraction used for
// profile sync (getResumeProfileDiff/syncResumeToProfile above).
export async function saveResumeSlotSections(
  resumeId: string,
  sections: ResumeSection[],
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("resumes")
      .update({ sections, sections_updated_at: new Date().toISOString() })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumes] saveResumeSlotSections", error);
      return { success: false, error: "Failed to save your changes" };
    }

    revalidatePath("/resume");
    revalidatePath(`/resume/${resumeId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] saveResumeSlotSections", error);
    return { success: false, error: "Failed to save your changes" };
  }
}

// Style never changes what the résumé says, only how it looks — same as
// the tailored résumé's saveResumeStyle.
export async function saveResumeSlotStyle(
  resumeId: string,
  style: ResumeStyle,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("resumes")
      .update({ style, sections_updated_at: new Date().toISOString() })
      .eq("id", resumeId)
      .eq("user_id", user.id);

    if (error) {
      console.error("[actions/resumes] saveResumeSlotStyle", error);
      return { success: false, error: "Failed to save your style changes" };
    }

    revalidatePath("/resume");
    revalidatePath(`/resume/${resumeId}`);
    return { success: true };
  } catch (error) {
    console.error("[actions/resumes] saveResumeSlotStyle", error);
    return { success: false, error: "Failed to save your style changes" };
  }
}

// Same shape/cost/quota bucket as actions/documents.ts's rewriteResumeBullet
// (bullet_rewrite, shared across every surface that rewrites one bullet) —
// the only real difference is there's no specific job to pull context from,
// so this falls back to the résumé slot's own free-text target_job_title
// when one was set.
export async function rewriteResumeSlotBullet(
  resumeId: string,
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

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "resumes/rewrite-bullet");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "bullet_rewrite");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const [{ data: profileRow }, { data: resume }] = await Promise.all([
      insforge.database
        .from("profiles")
        .select("preferred_model")
        .eq("id", user.id)
        .maybeSingle<Pick<Profile, "preferred_model">>(),
      insforge.database
        .from("resumes")
        .select("target_job_title")
        .eq("id", resumeId)
        .eq("user_id", user.id)
        .maybeSingle<{ target_job_title: string | null }>(),
    ]);

    const jobContext = resume?.target_job_title ? `Target role: ${resume.target_job_title}` : "";

    const { provider: rewriteProvider, tier: rewriteTier } = await resolveModelForUser(
      insforge, user.id, user.email, profileRow?.preferred_model,
    );
    const raw = await complete(await getModel(rewriteProvider, rewriteTier), {
      systemPrompt:
        `You are an expert resume writer. Rewrite a single work-experience bullet point to be more achievement-focused, starting with a strong action verb, roughly 15-25 words, one line. Do NOT invent any statistic, percentage, dollar amount, team size, or outcome not already stated or clearly implied in the original — only reframe, tighten, and better align what's already there. If a specific instruction is given, follow it. ${BULLET_QUALITY_RULES}\n\n${HUMANIZED_WRITING_RULES}\n\nReturn only valid JSON.`,
      userPrompt: `Role: ${entryTitle} at ${entryCompany}\n${jobContext}\nOriginal bullet: "${bulletText}"${instruction ? `\nSpecific instruction: ${instruction}` : ""}\n\nReturn JSON with this exact shape: { "rewritten": string }`,
      temperature: 0.5,
      maxTokens: 200,
      jsonResponse: true,
    });

    let parsed: { rewritten?: string };
    try {
      parsed = JSON.parse(raw) as { rewritten?: string };
    } catch (parseError) {
      console.error("[actions/resumes] rewriteResumeSlotBullet JSON parse failed", parseError, raw.slice(0, 300));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    if (!parsed.rewritten) {
      return { success: false, error: "The AI didn't return a rewrite. Please try again." };
    }

    return { success: true, text: parsed.rewritten };
  } catch (error) {
    console.error("[actions/resumes] rewriteResumeSlotBullet", error);
    return { success: false, error: "Failed to rewrite this bullet." };
  }
}
