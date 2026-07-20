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
  };
}

const SYSTEM_PROMPT = `You are a strict, honest career-fit evaluator grading job postings for a specific candidate across 10 fixed dimensions. Be direct — a mediocre or bad fit should get C/D/F grades, not inflated praise.

Grade every job across exactly these 10 dimensions, in this exact order, each with a one-line justification grounded in the actual job posting and candidate profile:
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
- matchedSkills/missingSkills: concrete skill names only, drawn from the candidate's real skills list and the job's actual stated requirements.
- overallGrade is your holistic letter grade for the role as a whole, not a mechanical average of the 10 dimensions.
- recommendationScore is 1-5 (5 = apply immediately, 1 = skip) — your honest overall recommendation, independent of but consistent with overallGrade.
- reasoning: one or two sentences a candidate would read first, summarizing why this grade.

Return ONLY valid JSON matching this exact shape:
{
  "evaluations": [
    {
      "id": "string — must match the job's given ID exactly",
      "dimensions": [
        { "dimension": "Skills/tech match", "grade": "A"|"B"|"C"|"D"|"F", "note": "string" },
        ... all 10 dimensions in the exact order given above ...
      ],
      "overallGrade": "A"|"B"|"C"|"D"|"F",
      "recommendationScore": number (1-5),
      "matchedSkills": string[],
      "missingSkills": string[],
      "reasoning": "string"
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
    maxTokens: 6000,
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
    };
  });
}
