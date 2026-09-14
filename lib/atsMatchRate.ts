import { buildTextIndex, extractPostingSoftSkills, splitSkills, textMentions } from "@/lib/atsSkills";
import { analyzeATSFormatting, type ATSIssue } from "@/lib/atsChecker";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// Jobscan-style Match Rate (Phase 53, direct user request: "have our ATS
// score work exactly the same way as the job scan is doing").
//
// NO THIRD-PARTY INTEGRATION IS NEEDED. Every input is already in this app:
//   * Searchability comes from ResumeSection[]/ResumeStyle, which this app
//     OWNS as structured data. Jobscan has to reverse-engineer this by
//     parsing an uploaded PDF and guessing where sections start and end; we
//     know, because the user built the resume in our editor. That makes
//     these checks strictly more reliable here, not less.
//   * Hard/soft skills reuse the matchedKeywords/missingKeywords this app
//     already computes for the fit score -- no second AI call.
//   * Recruiter tips are plain text statistics.
//
// HONESTY NOTE, load-bearing: Jobscan's exact weighting is proprietary and
// unpublished -- their own documentation says so. This implements the same
// four CATEGORIES and the same prioritisation logic (hard skills heaviest,
// searchability as a gatekeeper, soft skills light, recruiter tips advisory
// and outside the number), with our own transparent weights shown in the UI.
// It must never be described to a user as "the Jobscan algorithm", because
// it is not one and cannot be.

export type MatchCategoryKey = "searchability" | "hard_skills" | "soft_skills";

export type CategoryScore = {
  key: MatchCategoryKey;
  label: string;
  earned: number;
  weight: number;
  /** Plain-language reason this category scored what it did. */
  detail: string;
};

export type RecruiterTip = {
  id: string;
  passed: boolean;
  title: string;
  detail: string;
};

export type MatchRateResult = {
  /** 0-100. Searchability + hard + soft. Recruiter tips are NOT included -- see module comment. */
  matchRate: number;
  categories: CategoryScore[];
  searchabilityIssues: ATSIssue[];
  missingHardSkills: string[];
  matchedHardSkills: string[];
  missingSoftSkills: string[];
  matchedSoftSkills: string[];
  recruiterTips: RecruiterTip[];
  hasKeywordData: boolean;
  /** Jobscan's published guidance, and the number this UI holds users to. */
  targetRate: number;
  /** True past the point where further keyword gains usually mean stuffing. */
  stuffingRisk: boolean;
};

// Hard skills heaviest, searchability a gatekeeper, soft skills light --
// the ordering the research established. Recruiter tips deliberately carry
// ZERO numeric weight: they are advice for the human reader after the parse,
// and folding them into an "ATS match" number would misrepresent what the
// number measures.
const WEIGHTS = { searchability: 30, hard_skills: 55, soft_skills: 15 } as const;

export const MATCH_RATE_TARGET = 75;
const STUFFING_THRESHOLD = 90;

function collectBullets(sections: ResumeSection[]): string[] {
  const out: string[] = [];
  for (const s of sections) {
    if (!s.visible) continue;
    if (s.type === "work_experience" || s.type === "custom") {
      for (const e of s.entries) for (const b of e.bullets ?? []) if (b?.trim()) out.push(b);
    }
  }
  return out;
}

function resumeWordCount(sections: ResumeSection[]): number {
  let text = "";
  for (const s of sections) {
    if (!s.visible) continue;
    if (s.type === "summary") text += ` ${s.content ?? ""}`;
    if (s.type === "skills") text += ` ${(s.items ?? []).join(" ")}`;
    if (s.type === "work_experience" || s.type === "custom") {
      for (const e of s.entries) {
        text += ` ${e.title ?? ""} ${(e.bullets ?? []).join(" ")}`;
      }
    }
  }
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// A real measurable result is a digit that means something -- a percentage,
// an amount, a count, a multiple. Deliberately ignores a bare year like
// "2023", which is a date, not an achievement, and would otherwise mark
// every resume as quantified.
const MEASURABLE_PATTERN =
  /(\d+\s*%|[$€£]\s*\d|\b\d+(?:,\d{3})+\b|\b\d+(?:\.\d+)?\s*(?:x|k|m|bn|billion|million|thousand|hours?|days?|weeks?|months?|users?|customers?|clients?|people|engineers?|reports?)\b)/i;

function buildRecruiterTips(sections: ResumeSection[], style: ResumeStyle): RecruiterTip[] {
  const bullets = collectBullets(sections);
  const words = resumeWordCount(sections);
  const quantified = bullets.filter((b) => MEASURABLE_PATTERN.test(b)).length;
  const quantifiedPct = bullets.length > 0 ? Math.round((quantified / bullets.length) * 100) : 0;

  return [
    {
      id: "word-count",
      passed: words >= 400 && words <= 1000,
      title: `Word count: ${words}`,
      detail:
        words < 400
          ? "Under 400 words reads as thin -- most reviewers expect enough detail to judge scope."
          : words > 1000
            ? "Over 1,000 words is more than most recruiters will read. Tighten the oldest roles first."
            : "In the 400-1,000 range most recruiters expect.",
    },
    {
      id: "measurable-results",
      passed: quantifiedPct >= 40,
      title: `Measurable results: ${quantified} of ${bullets.length} bullets`,
      detail:
        quantifiedPct >= 40
          ? "Enough of your bullets carry a real number to show scope and impact."
          : "Fewer than 40% of your bullets contain a number. Quantified bullets are the strongest single signal of impact -- add real figures where you have them, or a [X] placeholder where you need to look one up.",
    },
    {
      id: "file-type",
      passed: style.template !== "split" && style.template !== "executive",
      title: "File type and layout",
      detail:
        style.template === "split" || style.template === "executive"
          ? "Exports use PDF standard-14 fonts with no text boxes or graphics, which is safe -- but your current template is two-column. See searchability above."
          : "Exports use PDF standard-14 fonts, single-column, with no text boxes or graphics. Nothing here will confuse a parser.",
    },
  ];
}

// Every string the reader of the résumé would see, from every visible
// section. Walks the section objects rather than naming each section type, so
// a new section type is searched automatically instead of silently skipped.
const NON_CONTENT_KEYS = new Set(["id", "type", "visible", "start_date", "end_date", "is_current", "url", "link", "date"]);

function resumeText(sections: ResumeSection[]): string {
  const parts: string[] = [];
  const walk = (value: unknown, key?: string): void => {
    if (key && NON_CONTENT_KEYS.has(key)) return;
    if (typeof value === "string") parts.push(value);
    else if (Array.isArray(value)) for (const v of value) walk(v);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, k);
  };
  for (const s of sections) if (s.visible) walk(s);
  return parts.join("\n");
}

export function computeMatchRate(
  style: ResumeStyle,
  sections: ResumeSection[],
  contact: { email: string | null; phone: string | null; location: string | null },
  matchedKeywords: string[],
  missingKeywords: string[],
  /** The job posting's text. When given, soft skills it names count too. */
  postingText?: string,
): MatchRateResult {
  const formatting = analyzeATSFormatting(style, sections, contact);
  // analyzeATSFormatting scores out of 50; rescaled to this category's
  // weight rather than duplicating its checks with different numbers.
  const searchabilityEarned = (formatting.score / formatting.maxScore) * WEIGHTS.searchability;

  // The AI fit check decides WHICH keywords the job wants. Whether the résumé
  // contains them is re-checked here against the résumé as it reads right
  // now (Phase 55), so an edit counts the moment it is made instead of after
  // the next paid re-score. AI "matched" verdicts are kept — they can be
  // semantic ("RESTful services" for "REST APIs") — while an AI "missing"
  // keyword the text now plainly contains is promoted.
  const index = buildTextIndex(resumeText(sections));
  const nowMatched = [...matchedKeywords];
  const stillMissing: string[] = [];
  for (const keyword of missingKeywords) (textMentions(index, keyword) ? nowMatched : stillMissing).push(keyword);

  const matched = splitSkills(nowMatched);
  const missing = splitSkills(stillMissing);

  // Soft skills the posting names that the AI keyword list did not already
  // cover (a posting asking for "leadership" is covered by an AI keyword
  // "Senior-level leadership", and is not counted twice).
  if (postingText?.trim()) {
    const known = [...matchedKeywords, ...missingKeywords].map((k) => buildTextIndex(k));
    for (const skill of extractPostingSoftSkills(postingText)) {
      if (known.some((k) => textMentions(k, skill))) continue;
      (textMentions(index, skill) ? matched.soft : missing.soft).push(skill);
    }
  }

  const hardTotal = matched.hard.length + missing.hard.length;
  const softTotal = matched.soft.length + missing.soft.length;
  const hasKeywordData = hardTotal + softTotal > 0;

  const hardEarned = hardTotal === 0 ? 0 : (matched.hard.length / hardTotal) * WEIGHTS.hard_skills;
  // A resume should not be punished for soft skills the job never asked for
  // -- full credit when the posting names none.
  const softEarned = softTotal === 0 ? WEIGHTS.soft_skills : (matched.soft.length / softTotal) * WEIGHTS.soft_skills;

  // With no keyword data, no target job has been checked yet. Report the
  // searchability score on its own scale rather than inventing keyword
  // credit -- and the UI labels it a formatting score, not a match rate.
  const matchRate = hasKeywordData
    ? Math.round(searchabilityEarned + hardEarned + softEarned)
    : Math.round((formatting.score / formatting.maxScore) * 100);

  const categories: CategoryScore[] = [
    {
      key: "searchability",
      label: "Searchability",
      earned: Math.round(searchabilityEarned),
      weight: WEIGHTS.searchability,
      detail:
        formatting.issues.length === 0
          ? "Contact fields, section headings and layout all parse cleanly."
          : `${formatting.issues.length} parsing issue${formatting.issues.length === 1 ? "" : "s"} -- fix these first, they gate everything else.`,
    },
    {
      key: "hard_skills",
      label: "Hard skills",
      earned: Math.round(hardEarned),
      weight: WEIGHTS.hard_skills,
      detail: hasKeywordData
        ? `${matched.hard.length} of ${hardTotal} technical skills from the posting appear in your resume.`
        : "No target job checked yet.",
    },
    {
      key: "soft_skills",
      label: "Soft skills",
      earned: Math.round(softEarned),
      weight: WEIGHTS.soft_skills,
      detail:
        softTotal === 0
          ? "This posting names no soft skills, so this category is not held against you."
          : `${matched.soft.length} of ${softTotal} named traits appear. Worth less than hard skills -- recruiters filter on the technical terms.`,
    },
  ];

  return {
    matchRate,
    categories,
    searchabilityIssues: formatting.issues,
    missingHardSkills: missing.hard,
    matchedHardSkills: matched.hard,
    missingSoftSkills: missing.soft,
    matchedSoftSkills: matched.soft,
    recruiterTips: buildRecruiterTips(sections, style),
    hasKeywordData,
    targetRate: MATCH_RATE_TARGET,
    stuffingRisk: matchRate >= STUFFING_THRESHOLD,
  };
}
