import { complete, getModel, type ModelProvider } from "@/lib/models";
import { isRateLimitError, rateLimitMessage } from "@/lib/errors";
import type { Profile, ResumeAnalysis, ResumeIssueSeverity } from "@/types";
import type { ResumeSection } from "@/types/resumeEditor";

// Builds the same shape of input text actions/resumes.ts's analyzeResume
// builds from a résumé slot's extracted_data — but from a tailored résumé's
// own sections (which may have hand-edited skills/education that have
// diverged from the base profile) instead, falling back to the profile for
// any section that's hidden or missing.
export function buildQualityAnalysisText(profile: Profile, sections: ResumeSection[], targetRole: string): string {
  const summarySection = sections.find((s) => s.type === "summary");
  const skillsSection = sections.find((s) => s.type === "skills");
  const workSection = sections.find((s) => s.type === "work_experience");
  const eduSection = sections.find((s) => s.type === "education");

  const skills = skillsSection?.type === "skills" ? skillsSection.items : (profile.skills ?? []);
  const workEntries = workSection?.type === "work_experience" ? workSection.entries : [];
  const eduEntries = eduSection?.type === "education" ? eduSection.entries : (profile.education ?? []);
  const summary = summarySection?.type === "summary" ? summarySection.content : "";

  return `
Target role: ${targetRole}
Current title: ${profile.current_title ?? "—"} (${profile.experience_level ?? "—"}, ${profile.years_experience ?? "—"} years)
Skills: ${skills.join(", ") || "—"}
Industries: ${(profile.industries ?? []).join(", ") || "—"}

Professional Summary: ${summary || "—"}

Work Experience:
${workEntries
  .map(
    (w) =>
      `- ${w.company} | ${w.title} | ${w.start_date} to ${w.is_current ? "Present" : w.end_date ?? "—"}\n  ${w.bullets.join(" ") || "(no description)"}`,
  )
  .join("\n")}

Education:
${eduEntries.map((e) => `- ${e.degree ?? "—"} in ${e.field ?? "—"}, ${e.institution ?? "—"} (${e.graduation_year ?? "—"})`).join("\n")}

Certifications: ${(profile.certifications ?? []).join(", ") || "—"}
`.trim();
}

// Extracted out of actions/resumes.ts's analyzeResume (the résumé-slot
// quality grader) so the same 10-dimension-rubric call can be reused for a
// tailored per-job résumé too, without duplicating the prompt/parse/count
// logic — only how the input text is built differs between the two callers.
const SYSTEM_PROMPT =
  "You are an expert résumé reviewer combining three lenses into one report. (1) A 10-DIMENSION ROLE-FIT MATRIX scoped specifically to the target role (pick 10 dimensions that actually matter for THIS role — e.g. for an engineering role: Technical Depth, System Design, Ownership & Scope, Collaboration, Impact Quantification, etc.; for a sales role the dimensions would be entirely different — do not use a generic template). Each dimension gets a letter grade (A-F) and a one-sentence reason grounded in the actual résumé text. (2) STRATEGIC NARRATIVE ALIGNMENT: read the whole résumé holistically and identify what career narrative it currently tells (e.g. 'individual contributor executor' vs 'team lead' vs 'strategic owner') versus what the target role likely expects — one paragraph. (3) INTERVIEWER SKEPTICISM: identify 2-4 specific things a sharp interviewer would probe or doubt (unexplained gaps, vague claims, seniority mismatches) — frame these as 'expect to be asked about this,' not as résumé-editing issues. Separately, identify concrete PER-BULLET issues in the work experience section only (not every bullet needs one — skip bullets that are already strong) with severity urgent/critical/optional, matched to the EXACT original bullet text so it can be found again. For each flagged bullet, also write a suggested rewrite. Only use information that is actually stated or clearly implied in the résumé — never invent metrics, employers, or outcomes. Return only valid JSON matching the exact schema given.";

export async function runResumeQualityAnalysis(
  provider: ModelProvider,
  résuméText: string,
): Promise<{ success: boolean; analysis?: ResumeAnalysis; error?: string }> {
  try {
    const raw = await complete(getModel(provider, "smart"), {
      systemPrompt: SYSTEM_PROMPT,
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
      console.error("[lib/resumeQuality] JSON parse failed", parseError, raw.slice(0, 500));
      return { success: false, error: "The AI response was incomplete. Please try again." };
    }

    // Counts are derived here, not trusted from the model — keeps the
    // top-level badge always internally consistent with what's actually in
    // `sections`, even if the model's own arithmetic is off.
    const countBy = (severity: ResumeIssueSeverity) => parsed.sections.filter((s) => s.severity === severity).length;

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

    return { success: true, analysis };
  } catch (error) {
    console.error("[lib/resumeQuality] runResumeQualityAnalysis", error);
    if (isRateLimitError(error)) {
      return { success: false, error: rateLimitMessage() };
    }
    return { success: false, error: "Failed to analyze this résumé." };
  }
}
