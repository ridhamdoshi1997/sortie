import { z } from "zod";

import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";
import { normalizeRoleFamily } from "@/lib/interviewQuestions";
import type { Profile } from "@/types";

// §Q2 correction memory — a bias via prompt context, not a hard override,
// so a genuinely different job in the same role family can still disagree
// if its actual requirements differ. See build-plan.md §Q2.
export type SkillCorrection = {
  role_family: string;
  skill: string;
  correction_type: "confirmed_have" | "confirmed_missing";
};

export type EvaluationGrade = "A" | "B" | "C" | "D" | "F";

// Fixed order per Phase 9 spec — never reorder, UI renders in this sequence.
export const EVALUATION_DIMENSIONS = [
  "Skills/tech match",
  "Seniority/level fit",
  "Compensation fit",
  "Location/remote fit",
  "Domain/industry fit",
  "Growth trajectory",
  "Culture/values signal",
  "Visa/work-authorization fit",
  "Application effort-to-value",
  "Legitimacy",
] as const;

export type DimensionName = (typeof EVALUATION_DIMENSIONS)[number];

export type EvaluationDimensionResult = {
  dimension: DimensionName;
  grade: EvaluationGrade;
  note: string;
};

export type JobEvaluationResult = {
  id: string;
  dimensions: EvaluationDimensionResult[];
  overallGrade: EvaluationGrade;
  recommendationScore: number; // 1-5
  // recommendationScore * 20, kept for existing sort/filter UI. null ONLY
  // for a genuinely failed evaluation (see EVALUATION_FAILED_REASON below)
  // — never a fabricated number standing in for "we don't know." The UI's
  // existing `match_score !== null` checks (JobResultCard.tsx,
  // JobDetailDrawer.tsx) already treat null as "not scored yet" and render
  // the same honest pending/retry state, so this needed no UI changes.
  matchScore: number | null;
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string; // one-line overall summary for the existing "Agent read" UI
  // Structured JD sections extracted from the raw posting text the model
  // already sees in buildJobText() — never populated anywhere before this,
  // despite the jobs table having had these columns and the UI reading them
  // (confirmed live: 2 real jobs with matchedSkills/evaluation but null
  // responsibilities/requirements/niceToHave/benefits). No separate AI call
  // for this — it rides along on the evaluation call that already reads the
  // full description, so there's no marginal cost.
  responsibilities: string[];
  requirements: string[];
  niceToHave: string[];
  benefits: string[];
  // Cleaned 2-4 sentence role/company summary, stripped of job-board/ATS
  // boilerplate (keyword-stuffing sections, "sign up free" prompts, salary-
  // context filler). Without this, the UI's about_role ?? description
  // fallback shows the raw scraped blob verbatim — the exact "pasted as-is"
  // complaint this whole extraction pass exists to fix.
  aboutRole: string;
  // Found via structural analysis of 25 real scraped postings: compensation
  // almost always appears as its own distinct block ("CAN base pay range
  // per year: $181,000-$241,000") but jobs.salary was only populated for
  // 134/771 real jobs — the rest either buried it in the raw text or lost
  // it. The caller only uses this as a fallback when job.salary is already
  // empty, never overwriting a real structured value from the scraper.
  salary: string;
  // Also found in the same analysis: a genuinely recurring, useful category
  // (interview steps/timeline/format — e.g. Acuity Insights' full
  // "Application Review -> Intro Chat -> Technical Deep Dive -> Decision"
  // pipeline) that wasn't captured by any existing field.
  hiringProcess: string[];
  // Extracted from the posting text — a normalized level label (e.g.
  // "Entry-level", "Mid-level", "Senior", "Lead", "Executive") and the
  // stated years-of-experience requirement (e.g. "5+ years"), when the
  // posting actually says so. Empty string when it doesn't — never guessed
  // from title alone.
  seniorityLevel: string;
  yearsExperienceRequired: string;
  // Bait-and-Switch Risk Scorer — rides on this same call (title/
  // seniorityLevel/responsibilities/requirements are already read for other
  // fields above), zero marginal AI cost. Distinct from the Legitimacy
  // dimension: that asks "is this a real job," this asks "does the
  // advertised level actually match the described work" (e.g. a "Director"
  // title whose responsibilities read as an individual-contributor role).
  titleScopeMismatch: {
    flagged: boolean;
    note: string;
  };
  // Not extracted from the posting — this is the model's own world
  // knowledge of the real company, used to build a reliable logo lookup.
  // Naive string-guessing (lowercase the company name, strip "inc"/"llc")
  // fails for any company known by an abbreviation or a name that doesn't
  // literally match its domain — "Bank of Montreal" isn't
  // bankofmontreal.com, it's bmo.com; "Royal Bank of Canada" is rbc.com,
  // not royalbankofcanada.com. Confirmed live (2026-07-28) that this was
  // the actual cause of most missing/wrong logos, not a broken logo API.
  // Empty string when the model isn't confident — never guess a plausible-
  // looking but wrong domain, since a wrong domain can silently return
  // ANOTHER real company's logo, not just a 404.
  companyDomain: string;
};

export type EvaluationJob = {
  id: string;
  title: string | null;
  company: string | null;
  location: string | null;
  description: string | null;
  about_role: string | null;
  salary: string | null;
  salary_min: number | null;
  salary_max: number | null;
  job_type: string | null;
  responsibilities: string[] | null;
  requirements: string[] | null;
  nice_to_have: string[] | null;
  benefits: string[] | null;
};

const gradeSchema = z.enum(["A", "B", "C", "D", "F"]);

const dimensionResultSchema = z.object({
  dimension: z.enum(EVALUATION_DIMENSIONS),
  grade: gradeSchema,
  note: z.string().min(1),
});

const jobEvaluationSchema = z.object({
  id: z.string(),
  dimensions: z.array(dimensionResultSchema).length(EVALUATION_DIMENSIONS.length),
  overallGrade: gradeSchema,
  recommendationScore: z.number().min(1).max(5),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  reasoning: z.string().min(1),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  niceToHave: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  aboutRole: z.string().default(""),
  salary: z.string().default(""),
  hiringProcess: z.array(z.string()).default([]),
  seniorityLevel: z.string().default(""),
  yearsExperienceRequired: z.string().default(""),
  companyDomain: z.string().default(""),
  titleScopeMismatch: z
    .object({
      flagged: z.boolean(),
      note: z.string(),
    })
    .default({ flagged: false, note: "" }),
});

const responseSchema = z.object({
  evaluations: z.array(jobEvaluationSchema),
});

function buildCandidateContext(profile: Profile): string {
  return `Current title: ${profile.current_title ?? "Unknown"}
Experience: ${profile.years_experience ?? "Unknown"} years, level ${profile.experience_level ?? "Unknown"}
Skills: ${profile.skills.join(", ") || "None saved"}
Industries: ${profile.industries.join(", ") || "None saved"}
Job titles seeking: ${profile.job_titles_seeking.join(", ") || "None saved"}
Current location: ${profile.location ?? "Not specified"}
Remote preference: ${profile.remote_preference ?? "Not specified"}
Preferred locations: ${profile.preferred_locations.join(", ") || "Not specified"}
Salary expectation: ${profile.salary_expectation ?? "Not specified"}
Work authorization: ${profile.work_authorization ?? "Not specified"}
Work history: ${JSON.stringify(profile.work_experience ?? [])}`;
}

function buildConstraintsText(constraints: Record<string, string>): string {
  const entries = Object.entries(constraints).filter(([, value]) => value.trim() !== "");
  if (entries.length === 0) {
    return "None provided — evaluate on the candidate profile and standard fit alone.";
  }
  return entries.map(([key, value]) => `- ${key.replace(/_/g, " ")}: ${value}`).join("\n");
}

// §Q2 — corrections the user has previously made for this same kind of
// role. Only ever a bias hint appended to the job's own text block, never
// folded into the shared candidate-profile context, since which
// corrections apply depends on THIS job's own role family.
function buildCorrectionsHint(job: EvaluationJob, corrections: SkillCorrection[]): string {
  if (corrections.length === 0) return "";
  const roleFamily = normalizeRoleFamily(job.title ?? "");
  const relevant = corrections.filter((c) => c.role_family === roleFamily);
  if (relevant.length === 0) return "";

  const has = relevant.filter((c) => c.correction_type === "confirmed_have").map((c) => c.skill);
  const missing = relevant.filter((c) => c.correction_type === "confirmed_missing").map((c) => c.skill);
  const parts: string[] = [];
  if (has.length > 0) parts.push(`has: ${has.join(", ")}`);
  if (missing.length > 0) parts.push(`does not have: ${missing.join(", ")}`);
  return `\nCandidate has previously confirmed for this kind of role (${roleFamily}) — ${parts.join("; ")}. Treat this as reliable self-reported signal, not something to re-derive from the posting text alone.`;
}

function buildJobText(job: EvaluationJob, corrections: SkillCorrection[] = []): string {
  return `ID: ${job.id}
Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Location: ${job.location ?? "Unknown"}
Job type: ${job.job_type ?? "Unknown"}
Salary: ${job.salary ?? "Unknown"}${job.salary_min || job.salary_max ? ` (range: ${job.salary_min ?? "?"} - ${job.salary_max ?? "?"})` : ""}
Description: ${job.about_role ?? job.description ?? "No description available"}
Responsibilities: ${(job.responsibilities ?? []).join("; ") || "Not listed"}
Requirements: ${(job.requirements ?? []).join("; ") || "Not listed"}
Nice to have: ${(job.nice_to_have ?? []).join("; ") || "Not listed"}
Benefits: ${(job.benefits ?? []).join("; ") || "Not listed"}${buildCorrectionsHint(job, corrections)}`;
}

// Exported so callers (the UI, the Inngest retry sweep) can detect a failed
// evaluation by identity rather than string-matching reasoning text, and so
// the neutral "C" grade this returns is never confused with a real,
// deliberate grade the model actually gave. matchScore stays null (not a
// fake 60) — a real fix for a live bug: a fabricated 60% MATCH read as a
// genuine, decent score to a candidate, even with the reasoning text
// admitting failure right below it (confirmed live, 2026-08-31 — ~73% of a
// large search's evaluations fell back like this, root cause was several
// concurrent searches racing the same rate-limited free-tier Gemini key,
// not a per-job content problem — see evaluateJobCompatibility's retry
// above this function for the actual fix; this fallback is now the rare
// last resort after a retry already failed twice).
export const EVALUATION_FAILED_REASON =
  "Automated evaluation failed for this job — will be retried automatically.";

function fallbackEvaluation(id: string): JobEvaluationResult {
  const dimensions = EVALUATION_DIMENSIONS.map((dimension) => ({
    dimension,
    grade: "C" as EvaluationGrade,
    note: "Evaluation unavailable — this job will be re-scored automatically.",
  }));

  return {
    id,
    dimensions,
    overallGrade: "C",
    recommendationScore: 3,
    matchScore: null,
    matchedSkills: [],
    missingSkills: [],
    reasoning: EVALUATION_FAILED_REASON,
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    benefits: [],
    aboutRole: "",
    salary: "",
    hiringProcess: [],
    seniorityLevel: "",
    yearsExperienceRequired: "",
    companyDomain: "",
    titleScopeMismatch: { flagged: false, note: "" },
  };
}

export const SYSTEM_PROMPT = `You are a strict, honest career-fit evaluator grading job postings for a specific candidate across 10 fixed dimensions. Be direct — a mediocre or bad fit should get C/D/F grades, not inflated praise.

Grade every job across exactly these 10 dimensions, in this exact order, each with a substantive 2-3 sentence justification grounded in the actual job posting and candidate profile — cite specific concrete detail (the actual skill, number, location, or phrase from the posting/profile), not a vague one-line summary:
1. Skills/tech match — how well the candidate's real skills cover what the job actually requires
2. Seniority/level fit — whether the role's level matches the candidate's experience
3. Compensation fit — how the posted salary (if any) compares to the candidate's stated expectation
4. Location/remote fit — how the job's location/remote policy matches the candidate's preference
5. Domain/industry fit — how well the job's industry matches the candidate's background/target industries
6. Growth trajectory — whether this role plausibly advances the candidate's career
7. Culture/values signal — what the posting's language signals about culture and working style
8. Visa/work-authorization fit — whether the posting's requirements conflict with the candidate's stated work authorization
9. Application effort-to-value — how much effort applying likely takes versus the expected payoff
10. Legitimacy — real ghost-listing/scam signals ONLY: no identifiable real company or a fabricated-sounding one, predatory/scam language (guaranteed huge pay for no experience, "send money to get started," pyramid-scheme phrasing), or content that actively contradicts itself. Grade this HARSHLY (D/F) only for one of THESE concrete red flags. A short or generic-sounding description is NOT itself a red flag — some sources only return a brief preview snippet, which is a data limitation, not a scam sign; a short snippet from a real, named, identifiable company should still grade A/B on legitimacy by default.

Rules:
- If an explicit constraint is provided and the job clearly fails to meet it, that must weigh heavily toward a low overall grade and recommendation score — never ignore an explicit stated constraint.
- Never invent facts about the job that aren't in the posting. If information for a dimension is missing, say so in the note and grade conservatively (C), not optimistically.
- Every note must do real work: name the specific requirement/signal from the posting, connect it to the specific fact from the candidate's profile that supports or contradicts it, and state the practical consequence for the candidate. Two or three sentences, not a fragment.
- matchedSkills/missingSkills: concrete skill names only, drawn from the candidate's real skills list and the job's actual stated requirements.
- overallGrade is your holistic letter grade for the role as a whole, not a mechanical average of the 10 dimensions.
- recommendationScore is 1-5 (5 = apply immediately, 1 = skip) — your honest overall recommendation, independent of but consistent with overallGrade.
- reasoning: one or two sentences a candidate would read first, summarizing why this grade.
- responsibilities/requirements/niceToHave/benefits: pull these directly out of the job's Description text (and its existing Responsibilities/Requirements/Nice to have/Benefits lines if already present) — each a short bullet-point phrase, not a full sentence rewrite. This is extraction, not generation: only include something if the posting actually states it. If the posting genuinely has no benefits section, return an empty array for benefits rather than guessing typical perks. requirements should hold only the must-haves; anything phrased as a plus/nice-to-have goes in niceToHave, not both.
- aboutRole: a clean 2-4 sentence prose summary of the role and company. The raw Description text is often a scraped job-board page mixed with boilerplate — salary-context filler ("Market median for X roles is..."), "Resume Keywords to Include" sections, "Sign up free to auto-tailor your resume" prompts, apply-tracking IDs, and near-identical Equal Opportunity/accommodation/legal disclaimer paragraphs that appear on almost every posting worded almost the same way regardless of employer. Ignore all of that noise; write the summary only from the real posting content underneath it — never include EEO/accommodation boilerplate in the summary, it carries no per-job signal.
- salary: the posting's stated compensation as a short human-readable string (e.g. "$150,000 - $180,000 CAD" or "$46-$65/hr"), extracted directly from wherever the posting states it (a dedicated "Compensation"/"Pay Details" block, or inline). Extraction, not invention — if the posting genuinely states no figure, return an empty string.
- hiringProcess: the posting's interview/application process detail, if it describes one (number of steps, format, timeline — e.g. "Application review", "Technical interview (1 hour)", "Final decision within 2-4 business days"). Each a short bullet-point phrase. Most postings won't have this — return an empty array rather than inventing a generic process.
- seniorityLevel: a short normalized label (e.g. "Entry-level", "Mid-level", "Senior", "Lead", "Executive") ONLY if the posting itself states or clearly implies a level (title or an explicit "Seniority Level" field) — extraction, not inference from tone. Return an empty string if the posting doesn't say.
- yearsExperienceRequired: the posting's stated experience requirement as a short string (e.g. "5+ years", "2-4 years"), extracted directly from the text. Return an empty string if the posting doesn't state one — never estimate from seniority level or title alone.
- companyDomain: the bare primary website domain of the company named in this posting (e.g. "bmo.com", "rbc.com", "scotiabank.com") — no protocol, no "www.", no path. Use your own real-world knowledge of the actual company, not a literal transformation of its name (Bank of Montreal is bmo.com, not bankofmontreal.com). Only return a domain you are genuinely confident is correct for THIS specific company — if you don't recognize the company or aren't sure, return an empty string. A wrong domain here would surface a completely different, unrelated company's logo, which is worse than showing no logo at all.
- titleScopeMismatch: flag true ONLY if the posting's own title/seniority language clearly conflicts with what the responsibilities/requirements actually describe — e.g. a "Director"/"Lead"/"Head of" title whose listed duties read as an individual-contributor role with no scope, budget, or people-management signal; or a "Senior" title whose requirements list junior-level years of experience. This is extraction and comparison, not suspicion — do NOT flag borderline or ambiguous cases, only clear, defensible mismatches you could explain concretely. note must cite the specific conflicting phrases from the title and the responsibilities/requirements. If there's no real mismatch, return { "flagged": false, "note": "" }.

Return ONLY valid JSON matching this exact shape:
{
  "evaluations": [
    {
      "id": "string — must match the job's given ID exactly",
      "dimensions": [
        { "dimension": "Skills/tech match", "grade": "A"|"B"|"C"|"D"|"F", "note": "string — 2-3 sentences with specific concrete detail" },
        ... all 10 dimensions in the exact order given above ...
      ],
      "overallGrade": "A"|"B"|"C"|"D"|"F",
      "recommendationScore": number (1-5),
      "matchedSkills": string[],
      "missingSkills": string[],
      "reasoning": "string",
      "responsibilities": string[],
      "requirements": string[],
      "niceToHave": string[],
      "benefits": string[],
      "aboutRole": "string",
      "salary": "string",
      "hiringProcess": string[],
      "seniorityLevel": "string",
      "yearsExperienceRequired": "string",
      "companyDomain": "string",
      "titleScopeMismatch": { "flagged": boolean, "note": "string" }
    }
  ]
}`;

// Phase 3 of the 3-phase redesign (2026-09-01) — the on-demand full-rubric
// pass for a job that already has a lite score (see
// evaluateJobCompatibilityLite below) needs its dimension write-ups to
// agree with the score a candidate already saw in the list, not
// independently re-derive a different one ("score drift" — the research
// pass that validated this redesign flagged an 85%-in-the-list/65%-on-open
// mismatch as an instant trust-breaker). This is prose context injected
// into the prompt, not a schema field — the actual persisted matchScore/
// recommendationScore/overallGrade/matchedSkills/missingSkills/reasoning
// on a full-pass write come from the ALREADY-STORED lite result, never
// from this call's own output (see evaluateJobFullAsync in
// lib/inngest/functions.ts) — this hint just keeps the model's own
// dimension notes from contradicting a verdict it isn't allowed to change.
function buildPinnedVerdictHint(pinned?: { matchScore: number; overallGrade: EvaluationGrade }): string {
  if (!pinned) return "";
  return `\n\nThis job has ALREADY been assigned a match score of ${pinned.matchScore}/100 (overall grade ${pinned.overallGrade}) by an earlier pass. Do not recalculate or contradict that verdict — write your 10 dimension grades/notes to be consistent with it.`;
}

export async function evaluateJobCompatibility(
  jobs: EvaluationJob[],
  constraints: Record<string, string>,
  profile: Profile,
  provider: ModelProvider = "gemini",
  corrections: SkillCorrection[] = [],
  tier: ModelTier = "smart",
  pinnedVerdict?: { matchScore: number; overallGrade: EvaluationGrade },
): Promise<JobEvaluationResult[]> {
  const userPrompt = `CANDIDATE PROFILE:
${buildCandidateContext(profile)}

EXPLICIT CONSTRAINTS FOR THIS SEARCH:
${buildConstraintsText(constraints)}${buildPinnedVerdictHint(pinnedVerdict)}

JOBS TO EVALUATE:
${jobs.map((job) => buildJobText(job, corrections)).join("\n\n---\n\n")}`;

  // Retried up to twice (one retry) before ever falling back — a real,
  // confirmed live incident (2026-08-31) found ~73% of a large search's
  // chunks failing parse/schema/completeness, and replaying the EXACT same
  // failing job data by hand succeeded immediately on a plain retry. Root
  // cause was several concurrent searches racing the same rate-limited
  // free-tier Gemini key (see evaluateJobChunk's throttle in
  // lib/inngest/functions.ts, the actual fix for the rate itself) — under
  // contention, complete()'s fallback chain lands on weaker, unvetted
  // backup models that are less reliable against this schema's size. A
  // retry after a short delay usually lands back on a healthy model/window.
  // Never retries more than once — a genuinely malformed job (not a
  // transient provider hiccup) shouldn't double real AI spend for nothing.
  async function attemptOnce(): Promise<{ evaluations: z.infer<typeof jobEvaluationSchema>[] } | null> {
    const raw = await complete(await getModel(provider, tier), {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      // NOT the fix for batch completeness — tested 12000 and 24000 with no
      // difference; the model was never truncating, it was silently omitting
      // jobs from the batch (see chunkArray call site in functions.ts, which
      // is the actual fix). This budget just needs headroom for a 5-job chunk
      // of richer 2-3 sentence notes, verified against real output length.
      // Bumped 8000 -> 10000 when responsibilities/requirements/niceToHave/
      // benefits extraction was added to this same call — real headroom need
      // (extra JSON fields per job), not a re-attempt at the completeness fix
      // above.
      maxTokens: 10000,
      jsonResponse: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("[lib/evaluator] JSON parse failed", error);
      return null;
    }

    const result = responseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[lib/evaluator] schema validation failed", result.error);
      return null;
    }

    if (result.data.evaluations.length < jobs.length) {
      // The model can return syntactically valid JSON that just omits some
      // requested jobs — schema validation alone won't catch this.
      console.error(
        `[lib/evaluator] incomplete batch: requested ${jobs.length} jobs, model returned ${result.data.evaluations.length}`,
      );
      return null;
    }

    return result.data;
  }

  let data = await attemptOnce();
  if (!data) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    data = await attemptOnce();
  }

  if (!data) {
    // Both attempts failed — a genuinely persistent issue (not the usual
    // transient contention), not something to keep retrying inline forever.
    // Missing jobs silently fall back to neutral C-grade placeholders below;
    // this log is the only signal that happened, so don't remove it.
    console.error(`[lib/evaluator] both attempts failed for a ${jobs.length}-job chunk — falling back`);
    return jobs.map((job) => fallbackEvaluation(job.id));
  }

  const byId = new Map(data.evaluations.map((evaluation) => [evaluation.id, evaluation]));

  return jobs.map((job) => {
    const evaluation = byId.get(job.id);
    if (!evaluation) {
      return fallbackEvaluation(job.id);
    }

    return {
      id: evaluation.id,
      dimensions: evaluation.dimensions,
      overallGrade: evaluation.overallGrade,
      recommendationScore: evaluation.recommendationScore,
      matchScore: Math.round(evaluation.recommendationScore * 20),
      matchedSkills: evaluation.matchedSkills,
      missingSkills: evaluation.missingSkills,
      reasoning: evaluation.reasoning,
      responsibilities: evaluation.responsibilities,
      requirements: evaluation.requirements,
      niceToHave: evaluation.niceToHave,
      benefits: evaluation.benefits,
      aboutRole: evaluation.aboutRole,
      salary: evaluation.salary,
      hiringProcess: evaluation.hiringProcess,
      seniorityLevel: evaluation.seniorityLevel,
      yearsExperienceRequired: evaluation.yearsExperienceRequired,
      companyDomain: evaluation.companyDomain,
      titleScopeMismatch: evaluation.titleScopeMismatch,
    };
  });
}

// Phase 2 of the 3-phase redesign (2026-09-01, validated by independent
// research as "highly recommended" before this was built — see
// context/RESUME.md's own "Next session, start here"). The list view only
// ever needs a score, a one-line reason, matched/missing skills, and the
// Legitimacy grade (still needed for the hard AI-side hide decision in
// lib/inngest/functions.ts) — the full 10-dimension write-ups and JD
// extraction (responsibilities/requirements/niceToHave/benefits/aboutRole/
// salary/hiringProcess/seniorityLevel/yearsExperienceRequired/
// companyDomain/titleScopeMismatch) are deferred to evaluateJobCompatibility
// (the "full" pass), run once, on demand, only for a job someone actually
// opens (evaluateJobFullAsync). This is the real cost/latency win a smaller
// output schema alone wouldn't deliver — the research flagged that INPUT
// tokens (the raw posting text) usually dominate cost more than output
// length does, so buildJobTextLite below also TRIMS what's sent, not just
// what's asked back.
export type LiteEvaluationResult = {
  id: string;
  overallGrade: EvaluationGrade;
  recommendationScore: number | null;
  matchScore: number | null; // null ONLY on genuine failure — same rule as the full pass.
  matchedSkills: string[];
  missingSkills: string[];
  reasoning: string;
  legitimacyGrade: EvaluationGrade;
  legitimacyNote: string;
};

// Real posting text is often thousands of characters of scraped
// boilerplate (EEOC/accommodation paragraphs, "sign up free" prompts,
// keyword-stuffing sections — see the full SYSTEM_PROMPT's own aboutRole
// note for the exact list). The lite pass only needs enough of the
// description to judge skills-match and ghost-listing signals, not to
// extract a clean prose summary from it — 1200 chars comfortably covers a
// posting's opening (the part that actually states role/requirements)
// without paying full-description input-token cost on every one of a
// search's ~80 jobs. responsibilities/requirements/niceToHave/benefits are
// deliberately dropped from this prompt too: on a freshly-scraped job
// they're almost always still empty (only the full AI pass populates them),
// so including them here is pure prompt-token waste, not information loss.
const LITE_DESCRIPTION_CHAR_LIMIT = 1200;

function buildJobTextLite(job: EvaluationJob, corrections: SkillCorrection[] = []): string {
  const rawDescription = job.about_role ?? job.description ?? "No description available";
  const description =
    rawDescription.length > LITE_DESCRIPTION_CHAR_LIMIT
      ? `${rawDescription.slice(0, LITE_DESCRIPTION_CHAR_LIMIT)}…`
      : rawDescription;

  return `ID: ${job.id}
Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Location: ${job.location ?? "Unknown"}
Job type: ${job.job_type ?? "Unknown"}
Salary: ${job.salary ?? "Unknown"}${job.salary_min || job.salary_max ? ` (range: ${job.salary_min ?? "?"} - ${job.salary_max ?? "?"})` : ""}
Description: ${description}${buildCorrectionsHint(job, corrections)}`;
}

const liteEvaluationSchema = z.object({
  id: z.string(),
  overallGrade: gradeSchema,
  recommendationScore: z.number().min(1).max(5),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  reasoning: z.string().min(1),
  legitimacyGrade: gradeSchema,
  legitimacyNote: z.string().min(1),
});

const liteResponseSchema = z.object({
  evaluations: z.array(liteEvaluationSchema),
});

const LITE_SYSTEM_PROMPT = `You are a fast, honest career-fit screener grading job postings for a specific candidate. This is a QUICK first pass, not the full evaluation — be direct and concise, not exhaustive.

For each job, produce:
- overallGrade: your holistic A-F letter grade for how well this role fits the candidate overall.
- recommendationScore: 1-5 (5 = apply immediately, 1 = skip) — your honest overall recommendation, independent of but consistent with overallGrade.
- matchedSkills/missingSkills: concrete skill names only, drawn from the candidate's real skills list and the job's actual stated requirements.
- reasoning: ONE sentence a candidate would read first, summarizing why this grade — the single most important reason, not a list.
- legitimacyGrade: real ghost-listing/scam signals ONLY — no identifiable real company or a name that reads fabricated, predatory/scam language (guaranteed huge pay for no experience, "send money to get started," pyramid-scheme phrasing), or content that actively contradicts itself. Grade HARSHLY (D/F) only when the posting shows one of THESE concrete red flags.
- legitimacyNote: ONE sentence citing the specific signal (or lack of one) behind legitimacyGrade.

Rules:
- If an explicit constraint is provided and the job clearly fails to meet it, that must weigh heavily toward a low overallGrade/recommendationScore — never ignore an explicit stated constraint.
- Never invent facts about the job that aren't in the posting. If the (truncated) description doesn't state something, don't guess — grade conservatively (C) rather than optimistically. This applies to overallGrade/recommendationScore, NOT legitimacyGrade.
- CRITICAL for legitimacyGrade: a SHORT description is not itself a red flag. Many real job boards (Adzuna and others) only return a brief teaser/preview snippet via their API, cut off mid-sentence — that is a data-source limitation, not a sign of a fake posting. A short snippet from a real, named, identifiable company (e.g. a known bank, insurer, tech company) should grade B or A on legitimacy by default, even if it says almost nothing about the actual role — grade it down only if it shows one of the concrete red flags above, never merely for being brief or generic-sounding. Reserve C/D/F for when the company itself is unnamed/unidentifiable or the text shows an actual scam pattern.

Return ONLY valid JSON matching this exact shape:
{
  "evaluations": [
    {
      "id": "string — must match the job's given ID exactly",
      "overallGrade": "A"|"B"|"C"|"D"|"F",
      "recommendationScore": number (1-5),
      "matchedSkills": string[],
      "missingSkills": string[],
      "reasoning": "string — one sentence",
      "legitimacyGrade": "A"|"B"|"C"|"D"|"F",
      "legitimacyNote": "string — one sentence"
    }
  ]
}`;

function fallbackLiteEvaluation(id: string): LiteEvaluationResult {
  return {
    id,
    overallGrade: "C",
    recommendationScore: null,
    matchScore: null,
    matchedSkills: [],
    missingSkills: [],
    reasoning: EVALUATION_FAILED_REASON,
    legitimacyGrade: "C",
    legitimacyNote: "Evaluation unavailable — this job will be re-scored automatically.",
  };
}

export async function evaluateJobCompatibilityLite(
  jobs: EvaluationJob[],
  constraints: Record<string, string>,
  profile: Profile,
  provider: ModelProvider = "gemini",
  corrections: SkillCorrection[] = [],
  tier: ModelTier = "smart",
): Promise<LiteEvaluationResult[]> {
  const userPrompt = `CANDIDATE PROFILE:
${buildCandidateContext(profile)}

EXPLICIT CONSTRAINTS FOR THIS SEARCH:
${buildConstraintsText(constraints)}

JOBS TO EVALUATE:
${jobs.map((job) => buildJobTextLite(job, corrections)).join("\n\n---\n\n")}`;

  // Same retry-once-then-fallback shape as evaluateJobCompatibility, and
  // for the same reason (evaluateJobChunk's throttle handles the actual
  // rate-limit fix; this just recovers from an occasional bad response on
  // a healthy window). A much smaller maxTokens than the full pass — no
  // 10-dimension write-ups or JD extraction to fit, just 8 short fields
  // per job.
  async function attemptOnce(): Promise<{ evaluations: z.infer<typeof liteEvaluationSchema>[] } | null> {
    const raw = await complete(await getModel(provider, tier), {
      systemPrompt: LITE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 3000,
      jsonResponse: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("[lib/evaluator] lite JSON parse failed", error);
      return null;
    }

    const result = liteResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[lib/evaluator] lite schema validation failed", result.error);
      return null;
    }

    if (result.data.evaluations.length < jobs.length) {
      console.error(
        `[lib/evaluator] lite incomplete batch: requested ${jobs.length} jobs, model returned ${result.data.evaluations.length}`,
      );
      return null;
    }

    return result.data;
  }

  let data = await attemptOnce();
  if (!data) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    data = await attemptOnce();
  }

  if (!data) {
    console.error(`[lib/evaluator] lite: both attempts failed for a ${jobs.length}-job chunk — falling back`);
    return jobs.map((job) => fallbackLiteEvaluation(job.id));
  }

  const byId = new Map(data.evaluations.map((evaluation) => [evaluation.id, evaluation]));

  return jobs.map((job) => {
    const evaluation = byId.get(job.id);
    if (!evaluation) return fallbackLiteEvaluation(job.id);

    return {
      id: evaluation.id,
      overallGrade: evaluation.overallGrade,
      recommendationScore: evaluation.recommendationScore,
      matchScore: Math.round(evaluation.recommendationScore * 20),
      matchedSkills: evaluation.matchedSkills,
      missingSkills: evaluation.missingSkills,
      reasoning: evaluation.reasoning,
      legitimacyGrade: evaluation.legitimacyGrade,
      legitimacyNote: evaluation.legitimacyNote,
    };
  });
}

// Legitimacy-only re-grade, used by the periodic recheck backfill
// (lib/inngest/functions.ts's legitimacyRecheckAsync). Deliberately NOT a
// second call into evaluateJobCompatibilityLite: that function requires a
// specific candidate's Profile/constraints/corrections to produce a
// matchScore, but legitimacyGrade's own prompt language never actually
// reasons about the candidate — it's a ghost-listing/scam check on the
// posting's own text, orthogonal to fit (same "authenticity and fit are
// orthogonal" principle lib/inngest/functions.ts's persist-chunk comment
// already established for why the paid apply-link rescue isn't gated on
// match score either). A dedicated, profile-independent prompt means the
// recheck backfill can re-grade any hidden/probation job for any user
// without loading that user's profile at all.
export type LegitimacyOnlyResult = { id: string; legitimacyGrade: EvaluationGrade; legitimacyNote: string };

const legitimacyOnlyEvaluationSchema = z.object({
  id: z.string(),
  legitimacyGrade: gradeSchema,
  legitimacyNote: z.string().min(1),
});

const legitimacyOnlyResponseSchema = z.object({
  evaluations: z.array(legitimacyOnlyEvaluationSchema),
});

const LEGITIMACY_ONLY_SYSTEM_PROMPT = `You are re-checking whether job postings show real ghost-listing/scam signals. This is a legitimacy-only re-grade, not a fit evaluation — there is no candidate to consider.

For each job, produce:
- legitimacyGrade: real ghost-listing/scam signals ONLY — no identifiable real company or a name that reads fabricated, predatory/scam language (guaranteed huge pay for no experience, "send money to get started," pyramid-scheme phrasing), or content that actively contradicts itself. Grade HARSHLY (D/F) only when the posting shows one of THESE concrete red flags.
- legitimacyNote: ONE sentence citing the specific signal (or lack of one) behind legitimacyGrade.

Rules:
- CRITICAL: a SHORT description is not itself a red flag. Many real job boards (Adzuna and others) only return a brief teaser/preview snippet via their API, cut off mid-sentence — that is a data-source limitation, not a sign of a fake posting. A short snippet from a real, named, identifiable company (e.g. a known bank, insurer, tech company) should grade B or A by default, even if it says almost nothing about the actual role — grade it down only if it shows one of the concrete red flags above, never merely for being brief or generic-sounding. Reserve C/D/F for when the company itself is unnamed/unidentifiable or the text shows an actual scam pattern.

Return ONLY valid JSON matching this exact shape:
{
  "evaluations": [
    { "id": "string — must match the job's given ID exactly", "legitimacyGrade": "A"|"B"|"C"|"D"|"F", "legitimacyNote": "string — one sentence" }
  ]
}`;

function fallbackLegitimacyOnly(id: string): LegitimacyOnlyResult {
  // C, not a D/F — a failed re-check must never itself count as a strike
  // against the job (see legitimacyRecheckAsync's own comment: only a
  // GENUINE second grade can confirm or clear the first one).
  return { id, legitimacyGrade: "C", legitimacyNote: "Re-check unavailable — kept at its prior status." };
}

export async function evaluateLegitimacyOnly(
  jobs: EvaluationJob[],
  provider: ModelProvider = "gemini",
  tier: ModelTier = "smart",
): Promise<LegitimacyOnlyResult[]> {
  const userPrompt = `JOBS TO RE-CHECK:
${jobs.map((job) => buildJobTextLite(job)).join("\n\n---\n\n")}`;

  async function attemptOnce(): Promise<{ evaluations: z.infer<typeof legitimacyOnlyEvaluationSchema>[] } | null> {
    const raw = await complete(await getModel(provider, tier), {
      systemPrompt: LEGITIMACY_ONLY_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 1500,
      jsonResponse: true,
    });

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("[lib/evaluator] legitimacy-only JSON parse failed", error);
      return null;
    }

    const result = legitimacyOnlyResponseSchema.safeParse(parsed);
    if (!result.success) {
      console.error("[lib/evaluator] legitimacy-only schema validation failed", result.error);
      return null;
    }

    if (result.data.evaluations.length < jobs.length) {
      console.error(
        `[lib/evaluator] legitimacy-only incomplete batch: requested ${jobs.length} jobs, model returned ${result.data.evaluations.length}`,
      );
      return null;
    }

    return result.data;
  }

  let data = await attemptOnce();
  if (!data) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    data = await attemptOnce();
  }

  if (!data) {
    console.error(`[lib/evaluator] legitimacy-only: both attempts failed for a ${jobs.length}-job chunk — falling back`);
    return jobs.map((job) => fallbackLegitimacyOnly(job.id));
  }

  const byId = new Map(data.evaluations.map((evaluation) => [evaluation.id, evaluation]));
  return jobs.map((job) => byId.get(job.id) ?? fallbackLegitimacyOnly(job.id));
}
