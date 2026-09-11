import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

// Deterministic half of "fix my score" (Phase 53, direct user request:
// "add option to fix the score and AI automatically add the missing piece
// into the resume i.e. keyword and also the formatting").
//
// The formatting fixes live here and involve NO AI at all. Every one of them
// is a mechanical, reversible rewrite of structured data this app owns:
// rename a non-standard section heading to its standard equivalent, and move
// a two-column template to a single-column one. There is no judgement to
// make, so spending an AI call -- and introducing the chance of it inventing
// something -- would be strictly worse.
//
// The keyword half is AI-assisted and lives in actions/atsAutoFix.ts,
// because it rewrites prose and therefore carries a fabrication risk that
// needs its own guardrails.

export type FormattingFix = {
  id: string;
  label: string;
  /** What the user will see change, in plain language. */
  description: string;
};

const HEADER_NORMALISATION: Record<string, string> = {
  "my journey": "Work Experience",
  "where i've worked": "Work Experience",
  "career history": "Work Experience",
  "employment history": "Work Experience",
  "professional background": "Work Experience",
  "what i do": "Skills",
  "my skills": "Skills",
  "core competencies": "Skills",
  "toolkit": "Skills",
  "tech stack": "Skills",
  "about me": "Professional Summary",
  "profile": "Professional Summary",
  "objective": "Professional Summary",
  "bio": "Professional Summary",
  "schooling": "Education",
  "academics": "Education",
  "academic background": "Education",
  "qualifications": "Education",
};

const SAFE_HEADERS = new Set([
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

const MULTI_COLUMN = new Set<ResumeStyle["template"]>(["split", "executive"]);

function defaultLabelFor(type: ResumeSection["type"]): string {
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

/**
 * Applies every safe, deterministic formatting fix.
 *
 * Returns new objects rather than mutating, so the caller can diff, preview
 * and undo. An unrecognised custom heading falls back to the section's own
 * default label rather than being guessed at -- renaming someone's
 * deliberate "Publications" section to "Projects" would be worse than
 * leaving a small score penalty in place.
 */
export function applyFormattingFixes(
  style: ResumeStyle,
  sections: ResumeSection[],
): { style: ResumeStyle; sections: ResumeSection[]; applied: FormattingFix[] } {
  const applied: FormattingFix[] = [];

  let nextStyle = style;
  if (MULTI_COLUMN.has(style.template)) {
    nextStyle = { ...style, template: "structured" };
    applied.push({
      id: "single-column",
      label: "Switched to a single-column template",
      description: `The "${style.template}" template puts Skills and Education in a sidebar. Older parsers read straight across the page and interleave the two columns into nonsense. Now using "Structured".`,
    });
  }

  const nextSections = sections.map((section) => {
    const current = section.type === "custom" ? section.title : section.label?.trim() || defaultLabelFor(section.type);
    const normalised = current.toLowerCase().trim();
    if (SAFE_HEADERS.has(normalised)) return section;

    const replacement = HEADER_NORMALISATION[normalised] ?? (section.type === "custom" ? null : defaultLabelFor(section.type));
    if (!replacement || replacement.toLowerCase() === normalised) return section;

    applied.push({
      id: `header-${section.id}`,
      label: `Renamed "${current}" to "${replacement}"`,
      description:
        "Parsers bucket content by matching headings against a known list. An unrecognised heading can dump the whole section into an unsearchable catch-all field.",
    });

    if (section.type === "custom") return { ...section, title: replacement };
    return { ...section, label: replacement };
  });

  return { style: nextStyle, sections: nextSections, applied };
}

/** True when there is anything for applyFormattingFixes to actually do. */
export function hasFormattingFixes(style: ResumeStyle, sections: ResumeSection[]): boolean {
  return applyFormattingFixes(style, sections).applied.length > 0;
}
