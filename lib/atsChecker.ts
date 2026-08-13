import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// ATS Compatibility Score — deliberately zero-cost and always-live, not a
// button-triggered AI call. Two dimensions, both genuinely new lenses this
// app doesn't already surface elsewhere, not a re-skin of an existing score:
//
// 1. Formatting/parseability risk — computed directly from ResumeStyle/
//    ResumeSection[], data this app already fully owns. Real ATS platforms
//    (Workday, Greenhouse, Taleo) genuinely mis-parse multi-column layouts
//    and non-standard section headers — documented, not fabricated. Fonts
//    and bullet glyphs are deliberately NOT checked here: ResumePDF.tsx only
//    ever renders the PDF standard-14 fonts (Helvetica/Times-Roman) and
//    bulletStyle is constrained to 3 safe glyphs — this app's own design
//    already makes those risks impossible, so checking for them would be
//    fabricating a risk that can't occur.
// 2. Keyword match density — reuses lib/scoreJump.ts's already-computed
//    matchedKeywords/missingKeywords (ResumeGapAnalysisResult) rather than
//    running a second AI call to re-derive the same thing under a different
//    name. This is why ATSAuditCard.tsx takes a ScoreJumpResult as a prop
//    instead of calling its own analysis action.

export type ATSIssueSeverity = "critical" | "warning";

export type ATSIssue = {
  id: string;
  severity: ATSIssueSeverity;
  title: string;
  description: string;
  howToFix: string;
};

export type ATSFormattingResult = {
  score: number; // out of 50
  maxScore: 50;
  issues: ATSIssue[];
};

export type ATSScoreResult = {
  overallScore: number; // 0-100
  formatting: ATSFormattingResult;
  keywordScore: number; // out of 50
  keywordMaxScore: 50;
};

const MULTI_COLUMN_TEMPLATES = new Set<ResumeStyle["template"]>(["split", "executive"]);

const SAFE_SECTION_HEADERS = new Set([
  "work experience",
  "professional experience",
  "experience",
  "education",
  "skills",
  "professional summary",
  "summary",
  "certifications",
  "projects",
  "languages",
  "awards",
  "volunteer experience",
]);

function defaultSectionLabel(type: ResumeSection["type"]): string {
  switch (type) {
    case "summary":
      return "Professional Summary";
    case "skills":
      return "Skills";
    case "work_experience":
      return "Work Experience";
    case "education":
      return "Education";
    case "certifications":
      return "Certifications";
    case "custom":
      return "Custom";
  }
}

export function analyzeATSFormatting(
  style: ResumeStyle,
  sections: ResumeSection[],
  contact: { email: string | null; phone: string | null; location: string | null },
): ATSFormattingResult {
  const issues: ATSIssue[] = [];
  let score = 50;

  if (MULTI_COLUMN_TEMPLATES.has(style.template)) {
    score -= 20;
    issues.push({
      id: "multi-column-layout",
      severity: "critical",
      title: "Multi-column layout",
      description: `The "${style.template}" template puts your Skills/Education in a sidebar next to your Summary/Work Experience. Older ATS parsers read left-to-right across the full page width, mixing sidebar and main-column text together.`,
      howToFix: 'Switch to a single-column template ("Structured", "Centered", "Timeline", or "Block") in the Style tab.',
    });
  }

  const visibleSections = sections.filter((s) => s.visible);
  for (const section of visibleSections) {
    const label = (section.type === "custom" ? section.title : section.label?.trim() || defaultSectionLabel(section.type))
      .toLowerCase()
      .trim();
    if (!SAFE_SECTION_HEADERS.has(label)) {
      score -= 6;
      issues.push({
        id: `nonstandard-header-${section.id}`,
        severity: "warning",
        title: `Non-standard section header: "${section.type === "custom" ? section.title : section.label}"`,
        description:
          "ATS parsers categorize resume content by matching section headers against a known list. An unrecognized header can dump that whole section into an unsearchable catch-all field.",
        howToFix: 'Use a standard label like "Work Experience", "Education", or "Skills" instead.',
      });
    }
  }

  const missingContact: string[] = [];
  if (!contact.email) missingContact.push("email");
  if (!contact.phone) missingContact.push("phone");
  if (!contact.location) missingContact.push("location");
  if (missingContact.length > 0) {
    score -= 10;
    issues.push({
      id: "missing-contact-fields",
      severity: "critical",
      title: `Missing ${missingContact.join(" and ")}`,
      description: "ATS platforms extract contact info as structured fields — a missing one can silently drop your application from recruiter search results.",
      howToFix: "Add this to your profile — it's pulled from there onto every résumé automatically.",
    });
  }

  return { score: Math.max(0, score), maxScore: 50, issues };
}

export function computeATSScore(
  formatting: ATSFormattingResult,
  matchedKeywords: string[],
  missingKeywords: string[],
): ATSScoreResult {
  const totalKeywords = matchedKeywords.length + missingKeywords.length;
  // No keyword data yet (no fit score has been run) — don't fabricate a
  // number, credit nothing until a real check has actually happened.
  const keywordScore = totalKeywords === 0 ? 0 : Math.round((matchedKeywords.length / totalKeywords) * 50);

  return {
    overallScore: formatting.score + keywordScore,
    formatting,
    keywordScore,
    keywordMaxScore: 50,
  };
}
