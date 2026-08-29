"use server";

import { revalidatePath } from "next/cache";
// Import from lib directly to avoid pdf-parse's index.js debug mode, which reads
// a test file on every require() call and crashes when module.parent is null
// (always the case under Next.js/Turbopack).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js") as (
  buf: Buffer,
) => Promise<{ text: string }>;

import { hasFullModelAccess, resolveModelForUser } from "@/lib/subscription";
import { requireUser } from "@/lib/auth";
import { createInsforgeServer } from "@/lib/insforge-server";
import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import { checkAndConsumeUsage } from "@/lib/usage";
import { featureDisabledMessage, isFeatureEnabled } from "@/lib/features";
import { checkRateLimit } from "@/lib/rateLimit";
import { isRateLimitError, rateLimitMessage } from "@/lib/errors";
import type { ResumeTheme } from "@/components/documents/ResumePDF";
import { trackPostHogEvent } from "@/lib/posthog-server";
import { calculateCompletion } from "@/lib/profile-utils";
import type { Education, Profile, WorkExperience } from "@/types";

// tier is optional and full-access-only (direct follow-up request,
// 2026-08-29: "admin, testers and owners can also see the fast tier models
// as well in the picking list") — lets a full-access user deliberately
// test what a free/Recon user's actual "fast" tier looks like on a given
// provider, without affecting what any regular user gets (see
// lib/subscription.ts's resolveModelForUser, which hard-forces "fast" for
// anyone without full access regardless of this column).
export async function setPreferredModel(
  provider: ModelProvider,
  tier?: ModelTier,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    // GPT/Claude cost real money per call — gated to admin/owner, testers,
    // and llmUnlocked paid plans (lib/subscription.ts's hasFullModelAccess,
    // shared with resolveModelForUser so the "who's allowed" and "what
    // actually runs" checks can never drift apart). Enforced here, the one
    // place preferred_model/preferred_tier is ever written, not just
    // hidden in the UI (a direct action call would otherwise bypass a
    // client-side-only restriction).
    const fullAccess = await hasFullModelAccess(insforge, user.id, user.email);
    if ((provider !== "gemini" || tier !== undefined) && !fullAccess) {
      return {
        success: false,
        error: "GPT and Claude are available on paid plans and to testers — upgrade or ask to be added as a tester.",
      };
    }

    const { error } = await insforge.database
      .from("profiles")
      .update({ preferred_model: provider, preferred_tier: fullAccess ? (tier ?? null) : null })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/profile] setPreferredModel", error);
      return { success: false, error: "Failed to save model preference" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] setPreferredModel", error);
    return { success: false, error: "Failed to save model preference" };
  }
}

// Backs the site-wide model selector (components/shared/SiteModelSelector.tsx,
// mounted in Navbar.tsx) — direct user request 2026-08-29: "admin, owners
// and some testers can get full model things and they also get the model
// selector option site wide". A self-fetching client component calls this
// on mount rather than threading eligibility through Navbar's props (same
// pattern GlobalSearchBar already established for a site-wide component).
export async function getModelSelectorState(): Promise<{
  eligible: boolean;
  current: ModelProvider;
  currentTier: ModelTier | null;
}> {
  const user = await requireUser();
  const insforge = await createInsforgeServer();

  const [eligible, { data: profileRow }] = await Promise.all([
    hasFullModelAccess(insforge, user.id, user.email),
    insforge.database
      .from("profiles")
      .select("preferred_model,preferred_tier")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model" | "preferred_tier">>(),
  ]);

  return {
    eligible,
    current: profileRow?.preferred_model ?? "gemini",
    currentTier: profileRow?.preferred_tier ?? "smart",
  };
}

export async function setPreferredResumeTheme(
  theme: ResumeTheme,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("profiles")
      .update({ preferred_resume_theme: theme })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/profile] setPreferredResumeTheme", error);
      return { success: false, error: "Failed to save theme preference" };
    }

    revalidatePath("/find-jobs");
    revalidatePath("/find-jobs/[id]", "page");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] setPreferredResumeTheme", error);
    return { success: false, error: "Failed to save theme preference" };
  }
}

type WorkExperienceEntry = {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
  responsibilities: string;
};

type EducationEntry = {
  degree: string;
  field: string;
  institution: string;
  graduation_year: string;
};

type ProfileFormData = {
  fullName: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  portfolioUrl: string;
  workAuth: string;
  currentTitle: string;
  experienceLevel: string;
  yearsExperience: string;
  skills: string[];
  industries: string[];
  workEntries: WorkExperienceEntry[];
  educationEntries: EducationEntry[];
  certifications: string[];
  jobTitlesSeeking: string[];
  remotePreference: string;
  salaryExpectation: string;
  preferredLocations: string[];
  coverLetterTone: string;
  // Split contact fields (build-plan.md's "Profile field granularity" gap)
  // — additive, optional, alongside fullName/phone/location above (those
  // stay the primary fields, unchanged). A prerequisite for future
  // ATS-autofill, not a replacement for the coarse fields every existing
  // consumer (résumé PDF/DOCX, cover letters) already reads.
  firstName: string;
  middleName: string;
  lastName: string;
  phoneType: string;
  phoneCountryCode: string;
  addressLine: string;
  addressCity: string;
  addressStateProvince: string;
  addressCountryRegion: string;
};

export async function saveProfile(
  data: ProfileFormData,
): Promise<{ success: boolean; error?: string }> {
  // requireUser must be outside try/catch — redirect() throws NEXT_REDIRECT
  // which would otherwise be caught and swallowed as a generic error.
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const education: Education[] = data.educationEntries
      .filter((e) => e.degree || e.field || e.institution || e.graduation_year)
      .map((e) => ({
        degree: e.degree || null,
        field: e.field || null,
        institution: e.institution || null,
        graduation_year: e.graduation_year || null,
      }));

    const parsed = parseInt(data.yearsExperience, 10);
    const yearsExperience =
      data.yearsExperience && !isNaN(parsed) ? parsed : null;

    const workExperience: WorkExperience[] = data.workEntries.map((e) => ({
      company: e.company,
      title: e.title,
      start_date: e.start_date,
      end_date: e.is_current ? null : e.end_date || null,
      is_current: e.is_current,
      responsibilities: e.responsibilities,
    }));

    const { data: existing } = await insforge.database
      .from("profiles")
      .select("is_complete")
      .eq("id", user.id)
      .maybeSingle<{ is_complete: boolean }>();

    const { isComplete } = calculateCompletion({
      full_name: data.fullName || null,
      phone: data.phone || null,
      location: data.location || null,
      current_title: data.currentTitle || null,
      experience_level: data.experienceLevel || null,
      years_experience: yearsExperience,
      skills: data.skills,
      work_experience: workExperience,
      education,
    });

    const profileFields = {
      full_name: data.fullName || null,
      phone: data.phone || null,
      location: data.location || null,
      linkedin_url: data.linkedinUrl || null,
      portfolio_url: data.portfolioUrl || null,
      work_authorization: data.workAuth || null,
      current_title: data.currentTitle || null,
      experience_level: data.experienceLevel || null,
      years_experience: yearsExperience,
      skills: data.skills,
      industries: data.industries,
      work_experience: workExperience,
      education,
      certifications: data.certifications,
      job_titles_seeking: data.jobTitlesSeeking,
      remote_preference: data.remotePreference || null,
      salary_expectation: data.salaryExpectation || null,
      preferred_locations: data.preferredLocations,
      cover_letter_tone: data.coverLetterTone || null,
      is_complete: isComplete,
      first_name: data.firstName || null,
      middle_name: data.middleName || null,
      last_name: data.lastName || null,
      phone_type: data.phoneType || null,
      phone_country_code: data.phoneCountryCode || null,
      address_line: data.addressLine || null,
      address_city: data.addressCity || null,
      address_state_province: data.addressStateProvince || null,
      address_country_region: data.addressCountryRegion || null,
    };

    const { data: updated, error } = await insforge.database
      .from("profiles")
      .update(profileFields)
      .eq("id", user.id)
      .select("id")
      .maybeSingle<{ id: string }>();

    if (error) {
      console.error("[actions/profile] saveProfile", error);
      return { success: false, error: "Failed to save profile" };
    }

    // Self-heal: a profiles row is normally provisioned by the
    // on_auth_user_created trigger on auth.users, but if that ever doesn't
    // fire (or the account predates it), the UPDATE above matches zero rows
    // and the user could never save anything. Insert the row instead of
    // dead-ending them. RLS (profiles_insert_own) still enforces id = auth.uid().
    if (!updated) {
      const { error: insertError } = await insforge.database
        .from("profiles")
        .insert([{ id: user.id, ...profileFields }]);

      if (insertError) {
        console.error("[actions/profile] saveProfile insert fallback", insertError);
        return { success: false, error: "Failed to save profile" };
      }
    }

    if (isComplete && !existing?.is_complete) {
      await trackPostHogEvent({
        event: "profile_completed",
        properties: { userId: user.id },
      });
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] saveProfile", error);
    return { success: false, error: "Failed to save profile" };
  }
}

export type EeocFormData = {
  raceEthnicity: string;
  gender: string;
  veteranStatus: string;
  disabilityStatus: string;
};

// Equal Employment Opportunity / voluntary self-identification — genuinely
// sensitive data, kept as its own action deliberately separate from
// saveProfile above so it can never be written as a side effect of an
// unrelated "save my profile" click. `consent` must be explicitly true
// (a real checkbox the user ticks, not a default) or nothing is written —
// eeoc_consented_at is the durable record that consent was actually given,
// not just implied by the fields being non-null.
export async function saveEeocInfo(
  data: EeocFormData,
  consent: boolean,
): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  if (!consent) {
    return { success: false, error: "Consent is required to save this information" };
  }

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("profiles")
      .update({
        eeoc_race_ethnicity: data.raceEthnicity || null,
        eeoc_gender: data.gender || null,
        eeoc_veteran_status: data.veteranStatus || null,
        eeoc_disability_status: data.disabilityStatus || null,
        eeoc_consented_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/profile] saveEeocInfo", error);
      return { success: false, error: "Failed to save this information" };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] saveEeocInfo", error);
    return { success: false, error: "Failed to save this information" };
  }
}

// Withdraws EEOC consent and clears every field — a real "changed my mind"
// path, not just a UI toggle. Clearing eeoc_consented_at means the profile
// UI's consent gate re-engages: the fields go back to hidden-until-consent.
export async function clearEeocInfo(): Promise<{ success: boolean; error?: string }> {
  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const { error } = await insforge.database
      .from("profiles")
      .update({
        eeoc_race_ethnicity: null,
        eeoc_gender: null,
        eeoc_veteran_status: null,
        eeoc_disability_status: null,
        eeoc_consented_at: null,
      })
      .eq("id", user.id);

    if (error) {
      console.error("[actions/profile] clearEeocInfo", error);
      return { success: false, error: "Failed to clear this information" };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] clearEeocInfo", error);
    return { success: false, error: "Failed to clear this information" };
  }
}

export async function uploadResume(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  // requireUser must be outside try/catch — redirect() throws NEXT_REDIRECT
  // which would otherwise be caught and swallowed as a generic error.
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

    const path = `${user.id}/resume.pdf`;

    // SDK has no upsert option — remove existing file first, then upload fresh
    await insforge.storage.from("resumes").remove(path);

    const { error: uploadError } = await insforge.storage
      .from("resumes")
      .upload(path, file);

    if (uploadError) {
      console.error("[actions/profile] uploadResume storage", uploadError);
      return { success: false, error: "Failed to upload resume" };
    }

    // Store the storage path, not a public URL — bucket is private.
    // Download happens via /api/resume/download which authenticates server-side.
    const { error: dbError } = await insforge.database
      .from("profiles")
      .update({ resume_pdf_url: path })
      .eq("id", user.id);

    if (dbError) {
      console.error("[actions/profile] uploadResume db", dbError);
      return { success: false, error: "Failed to save resume URL" };
    }

    revalidatePath("/profile");
    return { success: true };
  } catch (error) {
    console.error("[actions/profile] uploadResume", error);
    return { success: false, error: "Failed to upload resume" };
  }
}

export type ExtractedProfile = {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  experience_level: string | null;
  years_experience: number | null;
  skills: string[];
  industries: string[];
  work_experience: WorkExperience[];
  education: Education[];
  certifications: string[];
  job_titles_seeking: string[];
  linkedin_url: string | null;
  portfolio_url: string | null;
};

// Shared by extractProfile() below (existing single-résumé flow) and
// actions/resumes.ts's uploadResumeSlot() (new multi-résumé flow) — same
// Gemini prompt/schema either way, so a fix to extraction quality only
// needs to happen once. Callers own their own usage-cap/rate-limit checks
// (they run at different cadences: extractProfile is user-triggered on
// demand, uploadResumeSlot runs once automatically per upload) and their
// own error-message framing — this only does the PDF→JSON step itself.
export async function extractProfileFromBuffer(
  buffer: Buffer,
  preferredModel: Profile["preferred_model"],
  insforge: Awaited<ReturnType<typeof createInsforgeServer>>,
  userId: string,
  userEmail: string,
): Promise<{ success: boolean; data?: ExtractedProfile; error?: string }> {
  const pdfData = await pdfParse(buffer);
  const extractedText = pdfData.text;

  if (!extractedText || extractedText.trim().length < 50) {
    return {
      success: false,
      error: "Could not extract text from this PDF. Please try a different file.",
    };
  }

  const { provider: extractProvider, tier: extractTier } = await resolveModelForUser(insforge, userId, userEmail, preferredModel);
  const raw = await complete(await getModel(extractProvider, extractTier), {
    systemPrompt:
      "You are a resume parser, not a resume writer. Extract structured profile data from the resume text and return only valid JSON matching the exact schema provided. Use null for missing fields. Arrays must always be arrays (never null). Include every degree found, not just the highest one. experience_level must be one of: Junior, Mid-Level, Senior, Lead, Manager, Director, Executive — pick the closest match or null. CRITICAL — every field must come only from text that actually appears in the résumé, preserved as faithfully as possible, never invented, paraphrased, merged, or summarized: (1) If a role has no description text under it at all (just a title and dates), return an empty string for that role's responsibilities — never write generic filler like 'Software development and product design.' just to avoid an empty field. (2) The source PDF hard-wraps lines purely for page width — a line break mid-sentence is NOT a new bullet or paragraph, it's just where the page ran out of room; reflow wrapped lines belonging to the same bullet/sentence back into one continuous line. (3) If a role's description lists separate bullet points (marked with •, ●, - or similar, or a new sentence clearly starting a new distinct responsibility), preserve each one VERBATIM as its own single-line array item, one real bullet per \\n — strip only the marker character, do not reword or condense the wording itself. (4) If a role's description is one plain paragraph with no bullet markers, keep it as ONE reflowed paragraph (its own internal wraps rejoined, no \\n inserted) — do not invent bullet structure that isn't there.",
    userPrompt: `Extract profile data from this resume and return JSON with this exact shape:
{
  "full_name": string | null,
  "phone": string | null,
  "location": string | null,
  "current_title": string | null,
  "experience_level": "Junior"|"Mid-Level"|"Senior"|"Lead"|"Manager"|"Director"|"Executive"|null,
  "years_experience": number | null,
  "skills": string[],
  "industries": string[],
  "work_experience": [{ "company": string, "title": string, "start_date": string, "end_date": string|null, "is_current": boolean, "responsibilities": string }],
  "education": [{ "degree": string|null, "field": string|null, "institution": string|null, "graduation_year": string|null }],
  "certifications": string[],
  "job_titles_seeking": string[],
  "linkedin_url": string|null,
  "portfolio_url": string|null
}

Resume text:
${extractedText.slice(0, 6000)}`,
    temperature: 0.3,
    // 800 was too small: a full resume's work_experience array routinely
    // exceeds it, the response truncates mid-JSON, and JSON.parse below
    // throws — which is why extraction failed only on longer resumes.
    maxTokens: 4000,
    jsonResponse: true,
  });

  let extracted: ExtractedProfile;
  try {
    extracted = JSON.parse(raw) as ExtractedProfile;
  } catch (parseError) {
    console.error("[actions/profile] extractProfileFromBuffer JSON parse failed", parseError, raw.slice(0, 500));
    return {
      success: false,
      error: "The AI response for this resume was incomplete. Please try again — if it keeps failing, try a shorter resume.",
    };
  }

  return { success: true, data: extracted };
}

export async function extractProfile(): Promise<{
  success: boolean;
  data?: ExtractedProfile;
  error?: string;
}> {
  if (!isFeatureEnabled("resume_extract")) {
    return { success: false, error: featureDisabledMessage("resume_extract") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "profile/extract");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const { data: fileData, error: downloadError } = await insforge.storage
      .from("resumes")
      .download(`${user.id}/resume.pdf`);

    if (downloadError || !fileData) {
      return {
        success: false,
        error: "No resume found. Please upload your resume first.",
      };
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "resume_extract");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: existingProfile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    return await extractProfileFromBuffer(buffer, existingProfile?.preferred_model ?? null, insforge, user.id, user.email);
  } catch (error) {
    console.error("[actions/profile] extractProfile", error);

    // Distinguish provider rate limits from real failures — on the free
    // Gemini tier a burst of extractions returns 429, which previously
    // surfaced as a generic "failed" and looked like a broken feature.
    if (isRateLimitError(error)) {
      return { success: false, error: rateLimitMessage() };
    }

    return { success: false, error: "Failed to extract profile from resume." };
  }
}

type BulletContext = { title: string; company: string };

function bulletRateLimitError(error: unknown): string | null {
  return isRateLimitError(error) ? rateLimitMessage() : null;
}

// Free-tier Gemini (same key/quota as extractProfile) — no real $ cost, but
// still usage-capped (lib/usage.ts) since a single edit session can trigger
// several of these back to back. Deliberately does NOT invent metrics the
// candidate never mentioned — a fabricated stat on a resume is a much worse
// failure than a plain bullet, so the prompt only allows reframing what's
// already there, same honesty rule app/api/resume/generate/route.tsx uses.
export async function rewriteBullet(
  text: string,
  context: BulletContext,
): Promise<{ success: boolean; text?: string; error?: string }> {
  if (!isFeatureEnabled("bullet_rewrite")) {
    return { success: false, error: featureDisabledMessage("bullet_rewrite") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "profile/rewrite-bullet");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "bullet_rewrite");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    const { provider: rewriteProvider, tier: rewriteTier } = await resolveModelForUser(
      insforge, user.id, user.email, profile?.preferred_model,
    );
    const raw = await complete(
      await getModel(rewriteProvider, rewriteTier),
      {
        systemPrompt:
          "You are an expert resume writer. Rewrite a single work-experience bullet point to be more achievement-focused, starting with a strong action verb, roughly 15-25 words, one line. Do NOT invent any statistic, percentage, dollar amount, team size, or outcome that is not already stated or clearly implied in the original — only reframe and tighten what's already there. Return only valid JSON.",
        userPrompt: `Role: ${context.title} at ${context.company}\nOriginal bullet: "${text}"\n\nReturn JSON with this exact shape: { "rewritten": string }`,
        temperature: 0.4,
        maxTokens: 200,
        jsonResponse: true,
      },
    );

    let parsed: { rewritten?: string };
    try {
      parsed = JSON.parse(raw) as { rewritten?: string };
    } catch (parseError) {
      console.error("[actions/profile] rewriteBullet JSON parse failed", parseError, raw.slice(0, 300));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    if (!parsed.rewritten) {
      return { success: false, error: "The AI didn't return a rewrite. Please try again." };
    }

    return { success: true, text: parsed.rewritten };
  } catch (error) {
    console.error("[actions/profile] rewriteBullet", error);
    const rateLimitMessage = bulletRateLimitError(error);
    return { success: false, error: rateLimitMessage ?? "Failed to rewrite this bullet." };
  }
}

// Handles the real shape of a lot of extracted/imported responsibilities
// text: not multiple sentences run together (which a punctuation-based
// split can catch), but ONE grammatically single sentence bundling several
// distinct duties via commas/"and" ("Leading X, developing Y, managing Z").
// No regex can safely split that without either over- or under-splitting —
// only the model can tell where one responsibility ends and the next
// begins. Same anti-fabrication rule as rewriteBullet: this REORGANIZES
// existing content into separate bullets, never adds new claims.
export async function splitBullet(
  text: string,
  context: BulletContext,
): Promise<{ success: boolean; bullets?: string[]; error?: string }> {
  if (!isFeatureEnabled("bullet_rewrite")) {
    return { success: false, error: featureDisabledMessage("bullet_rewrite") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "profile/split-bullet");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "bullet_rewrite");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    const { provider: rewriteProvider, tier: rewriteTier } = await resolveModelForUser(
      insforge, user.id, user.email, profile?.preferred_model,
    );
    const raw = await complete(
      await getModel(rewriteProvider, rewriteTier),
      {
        systemPrompt:
          "You are an expert resume writer. The candidate has one dense resume bullet that actually bundles multiple distinct responsibilities or achievements together (often comma- or 'and'-separated). Split it into 2-5 separate, achievement-focused bullets, one per distinct idea, each starting with a strong action verb, one line each. Do NOT invent any statistic, percentage, dollar amount, team size, or outcome not already stated — only reorganize and lightly tighten what's already there. If the bullet genuinely only describes ONE idea, return it unchanged as a single-item array. Return only valid JSON.",
        userPrompt: `Role: ${context.title} at ${context.company}\nOriginal bullet: "${text}"\n\nReturn JSON with this exact shape: { "bullets": string[] }`,
        temperature: 0.3,
        maxTokens: 400,
        jsonResponse: true,
      },
    );

    let parsed: { bullets?: string[] };
    try {
      parsed = JSON.parse(raw) as { bullets?: string[] };
    } catch (parseError) {
      console.error("[actions/profile] splitBullet JSON parse failed", parseError, raw.slice(0, 300));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    if (!parsed.bullets?.length) {
      return { success: false, error: "The AI didn't return anything. Please try again." };
    }

    return { success: true, bullets: parsed.bullets };
  } catch (error) {
    console.error("[actions/profile] splitBullet", error);
    const rateLimitMessage = bulletRateLimitError(error);
    return { success: false, error: rateLimitMessage ?? "Failed to split this bullet." };
  }
}

// Same cost/honesty profile as rewriteBullet, but generates 3-4 DIFFERENT
// phrasings of one achievement from a short informal note, so the candidate
// picks a favorite instead of a single AI take getting auto-inserted — the
// anti-fabrication rule matters even more here since there's no prior bullet
// to anchor against.
export async function generateBullets(
  note: string,
  context: BulletContext,
): Promise<{ success: boolean; bullets?: string[]; error?: string }> {
  if (!isFeatureEnabled("bullet_rewrite")) {
    return { success: false, error: featureDisabledMessage("bullet_rewrite") };
  }

  const user = await requireUser();

  try {
    const insforge = await createInsforgeServer();

    const rateLimit = await checkRateLimit(insforge, user.id, user.email, "profile/generate-bullets");
    if (!rateLimit.allowed) {
      return { success: false, error: rateLimit.error };
    }

    const usage = await checkAndConsumeUsage(insforge, user.id, user.email, "bullet_rewrite");
    if (!usage.allowed) {
      return { success: false, error: usage.error };
    }

    const { data: profile } = await insforge.database
      .from("profiles")
      .select("preferred_model")
      .eq("id", user.id)
      .maybeSingle<Pick<Profile, "preferred_model">>();

    const { provider: rewriteProvider, tier: rewriteTier } = await resolveModelForUser(
      insforge, user.id, user.email, profile?.preferred_model,
    );
    const raw = await complete(
      await getModel(rewriteProvider, rewriteTier),
      {
        systemPrompt:
          "You are an expert resume writer. Given a candidate's brief, informal note about something they did in a role, turn it into 3-4 DIFFERENT polished, achievement-focused resume bullet point options for the SAME achievement — vary the angle (e.g. one concise, one leadership-forward, one impact-forward) so the candidate can pick their favorite. Each option is one line, roughly 15-25 words, starting with a strong action verb. Do NOT invent any statistic, percentage, dollar amount, team size, or outcome the candidate did not mention — only rephrase what they actually said. Return only valid JSON.",
        userPrompt: `Role: ${context.title} at ${context.company}\nCandidate's note: "${note}"\n\nReturn JSON with this exact shape: { "bullets": string[] } — the array must contain 3-4 alternative phrasings of this one achievement.`,
        temperature: 0.6,
        maxTokens: 400,
        jsonResponse: true,
      },
    );

    let parsed: { bullets?: string[] };
    try {
      parsed = JSON.parse(raw) as { bullets?: string[] };
    } catch (parseError) {
      console.error("[actions/profile] generateBullets JSON parse failed", parseError, raw.slice(0, 300));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    if (!parsed.bullets?.length) {
      return { success: false, error: "The AI didn't return any bullets. Try a more detailed note." };
    }

    return { success: true, bullets: parsed.bullets };
  } catch (error) {
    console.error("[actions/profile] generateBullets", error);
    const rateLimitMessage = bulletRateLimitError(error);
    return { success: false, error: rateLimitMessage ?? "Failed to generate bullets." };
  }
}
