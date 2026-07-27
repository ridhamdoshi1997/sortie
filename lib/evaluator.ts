import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type { Profile } from "@/types";

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
  matchScore: number; // recommendationScore * 20, kept for existing sort/filter UI
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

function buildJobText(job: EvaluationJob): string {
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
Benefits: ${(job.benefits ?? []).join("; ") || "Not listed"}`;
}

function fallbackEvaluation(id: string): JobEvaluationResult {
  const dimensions = EVALUATION_DIMENSIONS.map((dimension) => ({
    dimension,
    grade: "C" as EvaluationGrade,
    note: "Evaluation unavailable — graded as neutral pending re-evaluation.",
  }));

  return {
    id,
    dimensions,
    overallGrade: "C",
    recommendationScore: 3,
    matchScore: 60,
    matchedSkills: [],
    missingSkills: [],
    reasoning: "Automated evaluation failed for this job; showing a neutral placeholder score.",
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    benefits: [],
    aboutRole: "",
    salary: "",
    hiringProcess: [],
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
10. Legitimacy — ghost-listing/scam signals: vague comp, generic boilerplate descriptions, suspiciously broad requirements. Grade this HARSHLY (D/F) when the posting shows real red flags; grade A/B only when it reads as a genuine, specific, real hiring need.

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
      "hiringProcess": string[]
    }
  ]
}`;

export async function evaluateJobCompatibility(
  jobs: EvaluationJob[],
  constraints: Record<string, string>,
  profile: Profile,
  provider: ModelProvider = "gemini",
): Promise<JobEvaluationResult[]> {
  const userPrompt = `CANDIDATE PROFILE:
${buildCandidateContext(profile)}

EXPLICIT CONSTRAINTS FOR THIS SEARCH:
${buildConstraintsText(constraints)}

JOBS TO EVALUATE:
${jobs.map(buildJobText).join("\n\n---\n\n")}`;

  const raw = await complete(getModel(provider, "smart"), {
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
    return jobs.map((job) => fallbackEvaluation(job.id));
  }

  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[lib/evaluator] schema validation failed", result.error);
    return jobs.map((job) => fallbackEvaluation(job.id));
  }

  if (result.data.evaluations.length < jobs.length) {
    // The model can return syntactically valid JSON that just omits some
    // requested jobs — schema validation alone won't catch this. Missing
    // jobs silently fall back to neutral C-grade placeholders below; this
    // log is the only signal that happened, so don't remove it.
    console.error(
      `[lib/evaluator] incomplete batch: requested ${jobs.length} jobs, model returned ${result.data.evaluations.length}`,
    );
  }

  const byId = new Map(result.data.evaluations.map((evaluation) => [evaluation.id, evaluation]));

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
    };
  });
}
