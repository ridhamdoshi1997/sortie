import { analyzeResumeGap } from "@/agent/resumeGap";
import type { createInsforgeServer } from "@/lib/insforge-server";
import type { ModelProvider, ModelTier } from "@/lib/models";
import type { Job, Profile, ResumeGapAnalysisResult } from "@/types";
import type { ResumeSection } from "@/types/resumeEditor";

type Insforge = Awaited<ReturnType<typeof createInsforgeServer>>;

type GapJobRow = Pick<Job, "title" | "company" | "about_role" | "matched_skills" | "missing_skills"> & {
  resume_analysis: ResumeGapAnalysisResult | null;
};

// analyzeResumeGap wants a Profile-shaped object; the tailored résumé's own
// content lives in `sections`, not `profile`, so this builds that shape from
// whichever is actually visible in the workspace right now (falling back to
// the base profile for a hidden/removed section, and for fields sections
// don't cover at all — title/level/years/industries).
export function buildGapProfileFromSections(profile: Profile, sections: ResumeSection[]) {
  const skillsSection = sections.find((s) => s.type === "skills");
  const workSection = sections.find((s) => s.type === "work_experience");

  return {
    current_title: profile.current_title,
    experience_level: profile.experience_level,
    years_experience: profile.years_experience,
    industries: profile.industries,
    skills: skillsSection && skillsSection.type === "skills" && skillsSection.visible ? skillsSection.items : (profile.skills ?? []),
    work_experience:
      workSection && workSection.type === "work_experience" && workSection.visible
        ? workSection.entries.map((w) => ({
            company: w.company,
            title: w.title,
            start_date: w.start_date,
            end_date: w.end_date,
            is_current: w.is_current,
            responsibilities: w.bullets.join(" "),
          }))
        : profile.work_experience,
  };
}

export type ScoreJumpResult = ResumeGapAnalysisResult & { previousScore: number | null };

// Re-scores this job against the tailored résumé's CURRENT content, not the
// raw base profile — otherwise the score could never move when you edit a
// tailored copy, which is exactly why a score-jump changelog didn't exist
// before this feature. Persists the fresh result onto the same
// `jobs.resume_analysis` column the pre-existing profile-vs-job gap check
// already used; this only changes what it's scored against once a tailored
// résumé exists for the job.
export async function rescoreAgainstTailoredResume(
  insforge: Insforge,
  userId: string,
  jobId: string,
  profile: Profile,
  sections: ResumeSection[],
  provider: ModelProvider,
  tier: ModelTier,
): Promise<ScoreJumpResult> {
  const { data: jobRow } = await insforge.database
    .from("jobs")
    .select("title,company,about_role,matched_skills,missing_skills,resume_analysis")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle<GapJobRow>();

  const previousScore = jobRow?.resume_analysis?.score ?? null;

  if (!jobRow) {
    return { previousScore, score: previousScore ?? 0, checks: [], matchedKeywords: [], missingKeywords: [] };
  }

  const gapProfile = buildGapProfileFromSections(profile, sections);
  const result = await analyzeResumeGap(jobRow, gapProfile, provider, tier);

  await insforge.database.from("jobs").update({ resume_analysis: result }).eq("id", jobId).eq("user_id", userId);

  return { ...result, previousScore };
}
