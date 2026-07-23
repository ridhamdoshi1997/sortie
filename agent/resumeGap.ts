import { z } from "zod";

import { complete, getModel, type ModelProvider } from "@/lib/models";
import type {
  GapCheckResult,
  GapStatus,
  Job,
  Profile,
  ResumeGapAnalysisResult,
} from "@/types";

export type { GapCheckResult, GapStatus, ResumeGapAnalysisResult };

type GapJob = Pick<Job, "title" | "company" | "about_role" | "matched_skills" | "missing_skills">;

type GapProfile = Pick<
  Profile,
  "current_title" | "experience_level" | "years_experience" | "skills" | "industries" | "work_experience"
>;

const gapCheckSchema = z.object({
  label: z.string().min(1),
  status: z.enum(["pass", "warn", "fail"]),
  jobSide: z.string().min(1),
  resumeSide: z.string().min(1),
});

const resultSchema = z.object({
  score: z.number().min(0).max(10),
  checks: z.array(gapCheckSchema).min(3).max(7),
  matchedKeywords: z.array(z.string()).default([]),
  missingKeywords: z.array(z.string()).default([]),
});

function buildProfileContext(profile: GapProfile): string {
  return `Current title: ${profile.current_title ?? "Unknown"}
Experience: ${profile.years_experience ?? "Unknown"} years, level ${profile.experience_level ?? "Unknown"}
Skills: ${profile.skills.join(", ") || "None saved"}
Industries: ${profile.industries.join(", ") || "None saved"}
Work history: ${JSON.stringify(profile.work_experience ?? [])}`;
}

function buildJobContext(job: GapJob): string {
  return `Title: ${job.title ?? "Unknown"}
Company: ${job.company ?? "Unknown"}
Description: ${job.about_role ?? "No saved description"}
Matched skills (already computed): ${job.matched_skills.join(", ") || "None recorded"}
Missing skills (already computed): ${job.missing_skills.join(", ") || "None recorded"}`;
}

function fallbackResult(): ResumeGapAnalysisResult {
  return {
    score: 5,
    checks: [
      {
        label: "Analysis unavailable",
        status: "warn",
        jobSide: "—",
        resumeSide: "Could not compare your resume against this posting right now.",
      },
    ],
    matchedKeywords: [],
    missingKeywords: [],
  };
}

const SYSTEM_PROMPT = `You are a sharp, honest resume reviewer. Score how well ONE candidate's current resume/profile — as it stands today — fits ONE specific job posting. You are NOT scoring the candidate's overall career quality, only the fit of this resume to this posting.

Rules:
- score is 0-10. 8-10 = strong fit, ready to apply as-is. 6-7.9 = decent, real gaps worth closing. 4-5.9 = needs real tailoring before applying. Below 4 = weak fit for this specific posting.
- checks: 4-6 rows comparing a specific requirement (title, seniority, industry, a key skill area, the summary framing) against what the resume currently shows. status "pass" = resume already covers it well, "warn" = partially covered or phrased weakly, "fail" = missing or contradicted. jobSide is what the posting asks for; resumeSide is what the candidate's resume currently says (or "Not mentioned" if genuinely absent).
- matchedKeywords: concrete skill/tech terms the job posting asks for AND the candidate's real skills list already supports.
- missingKeywords: concrete skill/tech terms the job posting asks for that the candidate's real skills list does NOT support. Never invent a skill the candidate doesn't have — only report the gap.
- Ground everything in the actual profile and posting given. Never invent employers, titles, or skills not present in the input.

Return ONLY valid JSON matching this exact shape:
{
  "score": number (0-10),
  "checks": [
    { "label": "string", "status": "pass"|"warn"|"fail", "jobSide": "string", "resumeSide": "string" }
  ],
  "matchedKeywords": string[],
  "missingKeywords": string[]
}`;

export async function analyzeResumeGap(
  job: GapJob,
  profile: GapProfile,
  provider: ModelProvider = "gemini",
): Promise<ResumeGapAnalysisResult> {
  const userPrompt = `CANDIDATE PROFILE:
${buildProfileContext(profile)}

TARGET JOB POSTING:
${buildJobContext(job)}`;

  try {
    const raw = await complete(getModel(provider, "smart"), {
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.3,
      maxTokens: 1200,
      jsonResponse: true,
    });

    const parsed: unknown = JSON.parse(raw);
    const result = resultSchema.safeParse(parsed);

    if (!result.success) {
      console.error("[agent/resumeGap] schema validation failed", result.error);
      return fallbackResult();
    }

    return result.data;
  } catch (error) {
    console.error("[agent/resumeGap] analyzeResumeGap", error);
    return fallbackResult();
  }
}
