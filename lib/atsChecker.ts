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
  "licenses & certifications",
  "licenses and certifications",
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
    case "highlights":
      return "Key Highlights";
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
    // Highlights print in the header, with no heading to parse.
    if (section.type === "highlights") continue;
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

// Cover Letter ATS Score — same zero-cost, always-live philosophy as the
// résumé version above, but cover letters have no equivalent to
// scoreJump.matchedKeywords/missingKeywords to reuse (there's no existing
// fit-score gauge for cover letters in this app), so building a *new* AI
// call just to re-create that would break the "reuse what's already
// computed" principle the résumé version relies on. Scoped instead to 4
// fully deterministic checks — word count, whether the company is actually
// named anywhere in the letter (a real, cheap proxy for "this wasn't mass-
// blasted"), a generic-salutation phrase check, and the same multi-column
// "split"-template sidebar risk CoverLetterPDF.tsx genuinely renders for
// letters too (confirmed by reading that file, not assumed).
export type CoverLetterATSResult = {
  overallScore: number; // 0-100
  issues: ATSIssue[];
  wordCount: number;
};

const GENERIC_SALUTATION_PHRASES = ["to whom it may concern", "dear sir or madam", "dear sir/madam"];

export function analyzeCoverLetterATS(
  style: ResumeStyle,
  letterBody: string,
  salutation: string | null,
  company: string | null,
): CoverLetterATSResult {
  const issues: ATSIssue[] = [];
  let score = 100;

  const wordCount = letterBody.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {
    // Nothing written yet — don't pile on every other check against an
    // empty draft, just say so.
    return { overallScore: 0, wordCount: 0, issues: [] };
  }
  if (wordCount < 100 || wordCount > 600) {
    score -= 20;
    issues.push({
      id: "word-count-extreme",
      severity: "critical",
      title: `${wordCount} words — outside a realistic letter length`,
      description: "A cover letter under 100 or over 600 words reads as either an unfinished draft or a wall of text most reviewers won't finish.",
      howToFix: "Aim for 200-400 words — 3-4 short paragraphs.",
    });
  } else if (wordCount < 200 || wordCount > 400) {
    score -= 10;
    issues.push({
      id: "word-count-offrange",
      severity: "warning",
      title: `${wordCount} words — outside the typical 200-400 range`,
      description: "Not a hard rule, but most effective cover letters land in this range — long enough to make a real case, short enough to actually get read.",
      howToFix: "Trim or expand toward 200-400 words.",
    });
  }

  if (MULTI_COLUMN_TEMPLATES.has(style.template) && style.template === "split") {
    score -= 30;
    issues.push({
      id: "multi-column-layout",
      severity: "critical",
      title: "Multi-column layout",
      description: 'The "split" template puts your contact info and skills in a sidebar next to the letter body — the same left-to-right parsing risk as a multi-column résumé.',
      howToFix: 'Switch to a single-column template ("Structured", "Centered", "Timeline", or "Block") in the Style tab.',
    });
  }

  if (company && company.trim()) {
    const mentionsCompany = letterBody.toLowerCase().includes(company.trim().toLowerCase());
    if (!mentionsCompany) {
      score -= 20;
      issues.push({
        id: "no-company-mention",
        severity: "warning",
        title: `Doesn't mention "${company}" anywhere`,
        description: "A letter that never names the company it's addressed to reads as a generic template sent to every employer, not a real application to this one.",
        howToFix: `Work the company name into the opening or closing paragraph at least once.`,
      });
    }
  }

  const salutationLower = (salutation ?? "").trim().toLowerCase();
  if (GENERIC_SALUTATION_PHRASES.some((phrase) => salutationLower.includes(phrase))) {
    score -= 15;
    issues.push({
      id: "generic-salutation",
      severity: "warning",
      title: "Generic salutation",
      description: '"To Whom It May Concern" and similar phrases read as impersonal and dated to most reviewers.',
      howToFix: 'Use "Dear Hiring Team" or a named contact if you have one — leave the field blank to use this app\'s own "Hiring Team, {Company}" default.',
    });
  }

  return { overallScore: Math.max(0, score), wordCount, issues };
}
