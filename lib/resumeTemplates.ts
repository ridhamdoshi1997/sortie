import type { ResumeSection, ResumeStyle, ResumeTemplate } from "@/types/resumeEditor";

// Template catalog: names, ATS safety labels, and the starting style and
// section order the two Phase 1 templates bring with them.

export type TemplateMeta = {
  label: string;
  /** "safe" = one column, nothing a parser misreads. "risky" = columns, which Workday and Taleo read badly. */
  ats: "safe" | "risky";
  description: string;
};

export const TEMPLATE_META: Record<ResumeTemplate, TemplateMeta> = {
  professional: {
    label: "Professional",
    ats: "safe",
    description: "Capitalized centered header, grouped skill lines, company-first roles. For experienced professionals.",
  },
  early_career: {
    label: "Early Career",
    ats: "safe",
    description: "Compact header with a highlights strip, licenses first, two-column skills. For early careers and regulated fields.",
  },
  structured: { label: "Structured", ats: "safe", description: "Classic single column." },
  centered: { label: "Centered", ats: "safe", description: "Single column with a centered header and headings." },
  timeline: { label: "Timeline", ats: "safe", description: "Single column with a date column for each role." },
  block: { label: "Block", ats: "safe", description: "Single column with a colored banner header." },
  split: { label: "Split", ats: "risky", description: "Two columns with a left sidebar." },
  // Stored value stays "executive"; renamed so it can't be confused with "Professional".
  executive: { label: "Executive Sidebar", ats: "risky", description: "Full-width header over two columns with a right sidebar." },
};

export const TEMPLATE_ORDER: ResumeTemplate[] = [
  "professional",
  "early_career",
  "structured",
  "centered",
  "timeline",
  "block",
  "split",
  "executive",
];

// Section keys for a recommended order. "custom:<title>" matches a custom
// section by its title (case-insensitive), e.g. Projects.
type OrderKey = ResumeSection["type"] | `custom:${string}`;

type TemplatePreset = {
  style: Partial<ResumeStyle>;
  sectionOrder: OrderKey[];
  /** Plain-language version of sectionOrder, for the Style tab. */
  orderLabel: string;
};

// Spacing values are slider positions on the version-2 ranges (see
// ResumePDF.tsx's SPACING_RANGES_V2): section 2–32pt, entry 2–20pt, line
// 1.0–1.8×, margins 20–60pt. The comments give the real value each maps to,
// measured from the Word files the templates are modeled on.
export const TEMPLATE_PRESETS: Partial<Record<ResumeTemplate, TemplatePreset>> = {
  professional: {
    style: {
      fontFamily: "calibri",
      nameUppercase: true,
      headerAlignment: "center",
      skillsDisplay: "grouped",
      entryHeader: "company_first",
      certificationsDisplay: "inline",
      bulletStyle: "•",
      accentColorOverride: null,
      colors: { accent: "#1F3864", accentDark: "#1F3864", ink: "#1A1A1A", body: "#1A1A1A", muted: "#444444", rule: "#1F3864" },
      fontSizes: { name: 20, heading: 10.5, subheading: 10.5, body: 10, contact: 9, dates: 10 },
      spacingVersion: 2,
      // section 10pt · entry 6.5pt · line 1.2× · margins 31pt (0.43")
      spacing: { section: 27, entry: 25, line: 25, margins: 28 },
    },
    sectionOrder: ["highlights", "summary", "skills", "work_experience", "custom:projects", "education", "certifications"],
    orderLabel: "Summary → Skills → Experience → Projects → Education → Certifications",
  },
  early_career: {
    style: {
      fontFamily: "calibri",
      nameUppercase: true,
      headerAlignment: "center",
      skillsDisplay: "bulleted",
      skillsColumns: 2,
      entryHeader: "title_first",
      certificationsDisplay: "stacked",
      bulletStyle: "•",
      accentColorOverride: null,
      colors: { accent: "#1F2A44", accentDark: "#1F2A44", ink: "#111111", body: "#222222", muted: "#444444", rule: "#1F2A44" },
      fontSizes: { name: 19, heading: 10, subheading: 11, body: 10, contact: 9.5, dates: 10 },
      spacingVersion: 2,
      // section 6pt · entry 3pt · line 1.15× · margins 29pt (0.4"; the source
      // file used 23pt top/bottom, which is risky on a home printer)
      spacing: { section: 13, entry: 6, line: 19, margins: 23 },
    },
    sectionOrder: ["highlights", "summary", "certifications", "skills", "work_experience", "education"],
    orderLabel: "Summary → Licenses & Certifications → Skills → Experience → Education",
  },
};

// Knobs only the Phase 1 templates set. Cleared when switching to a template
// without a preset, so a Structured résumé never inherits company-first roles
// or a navy palette it has no control for.
const TEMPLATE_ONLY_KNOBS: (keyof ResumeStyle)[] = [
  "nameUppercase",
  "skillsDisplay",
  "entryHeader",
  "certificationsDisplay",
  "colors",
];

/** The style after picking a template. Keeps the user's font, sizes and spacing on templates without a preset. */
export function applyTemplate(style: ResumeStyle, template: ResumeTemplate): ResumeStyle {
  const preset = TEMPLATE_PRESETS[template];
  if (preset) return { ...style, ...preset.style, template };

  const next: ResumeStyle = { ...style, template };
  const hadPreset = Boolean(TEMPLATE_PRESETS[style.template]);
  if (hadPreset) for (const key of TEMPLATE_ONLY_KNOBS) delete next[key];
  return next;
}

function orderKeyOf(section: ResumeSection): OrderKey {
  return section.type === "custom" ? `custom:${section.title.trim().toLowerCase()}` : section.type;
}

/**
 * Sections sorted into a template's recommended order. Sections the order
 * doesn't name keep their relative order after the named ones, so nothing is
 * dropped. Returns null when the template has no recommendation.
 */
export function orderSectionsForTemplate(sections: ResumeSection[], template: ResumeTemplate): ResumeSection[] | null {
  const preset = TEMPLATE_PRESETS[template];
  if (!preset) return null;
  const rank = new Map(preset.sectionOrder.map((key, i) => [key, i]));
  return sections
    .map((section, index) => ({ section, index, rank: rank.get(orderKeyOf(section)) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ section }) => section);
}

/** True when sections are already in the template's recommended order. */
export function isInTemplateOrder(sections: ResumeSection[], template: ResumeTemplate): boolean {
  const ordered = orderSectionsForTemplate(sections, template);
  return !ordered || ordered.every((s, i) => s.id === sections[i]?.id);
}
