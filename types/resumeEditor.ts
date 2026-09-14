import type { Education } from "@/types";
import type { ResumeTheme } from "@/components/documents/ResumePDF";

// A tailored résumé's own independent snapshot of content — separate from
// `profiles.work_experience`/`education`/`skills`. Editing these never
// writes back to the base profile; that's the whole point (see the sync
// modal's own "nothing else is touched" promise, and build-plan.md's
// explicit warning about base-résumé-vs-tailored-copy data corruption).
export type TailoredWorkEntry = {
  company: string;
  title: string;
  start_date: string;
  end_date: string | null;
  is_current: boolean;
  bullets: string[];
};

// A user-defined section outside the 4 built-in types (Projects,
// Certifications, Languages, Awards, Volunteer Experience, or a blank
// "Custom" section) — researched via agy: real résumé builders (Enhancv,
// Novoresume) use exactly this hybrid, a small preset catalog plus a
// freeform escape hatch, backed by ONE generic entry shape rather than a
// bespoke data model per preset. Never AI-authored (regenerate/revise only
// ever touch summary/work_experience — see mergeGeneratedContent), and
// deliberately excluded from scoreJump/resumeQuality's analysis for the same
// reason: those only know about the 4 original types today.
export type CustomEntry = { title: string; subtitle: string; date: string; bullets: string[] };

// Mirrors Education's own "real, structured, fully editable" treatment —
// the base profile only ever stores certifications as a flat string[]
// (profiles.certifications), so buildDefaultSections seeds `name` from that
// and leaves issuer/date blank for the user to fill in, same spirit as
// education entries seeded from a résumé upload before the user refines them.
export type CertificationEntry = { name: string; issuer: string; date: string };

export type ResumeSection =
  | { id: string; type: "summary"; visible: boolean; content: string; label?: string }
  | { id: string; type: "skills"; visible: boolean; items: string[]; label?: string }
  | { id: string; type: "work_experience"; visible: boolean; entries: TailoredWorkEntry[]; label?: string }
  | { id: string; type: "education"; visible: boolean; entries: Education[]; label?: string }
  | { id: string; type: "certifications"; visible: boolean; entries: CertificationEntry[]; label?: string }
  | { id: string; type: "custom"; visible: boolean; title: string; entries: CustomEntry[] };

export type ResumeSectionType = ResumeSection["type"];

// The 4 built-in types carry an optional `label` override (e.g. "Professional
// Experience" instead of "Work Experience"); "custom" always has its own
// user-given `title` instead, since there's no sensible default to fall back
// to. This helper is the one place that distinction is resolved everywhere
// a section header needs display text.
export function sectionDisplayLabel(section: ResumeSection, defaultLabel: string): string {
  if (section.type === "custom") return section.title;
  return section.label?.trim() || defaultLabel;
}

// "Master of Electrical and Computer Engineering in Electrical and Computer
// Engineering" was printed on a real résumé (2026-09-14): the degree name
// already contains the field, and every renderer appended " in <field>"
// regardless. Shared by the PDF and DOCX exports so they cannot disagree.
export function formatDegree(degree: string | null | undefined, field: string | null | undefined): string {
  const d = (degree ?? "").trim();
  const f = (field ?? "").trim();
  if (!f) return d;
  if (!d) return f;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalize(d).includes(normalize(f)) ? d : `${d} in ${f}`;
}

// "structured" is the original single-column layout. "centered" is the same
// flow with a centered header/section titles. "split" is a two-column
// sidebar layout (Contact+Skills+Education in a left sidebar, Summary+Work
// Experience in the main column) — modeled on the real LinkedIn-export PDF
// layout seen in this project's own test data. Researched via agy (real
// products: Rezi/Teal, Novoresume/Kickresume, Enhancv/Canva) and added
// 2026-08-06: "timeline" is single-column with a dedicated date column per
// work-experience entry; "executive" mirrors split but with the sidebar on
// the RIGHT and a full-width header above the two-column row instead of
// inside the sidebar; "block" is single-column with a solid-color header
// banner and centered, thick-ruled section titles.
export type ResumeTemplate = "structured" | "centered" | "split" | "timeline" | "executive" | "block";

export type ResumeStyle = {
  template: ResumeTemplate;
  // Base color/font preset — same 3 themes ResumePDF already ships with.
  theme: ResumeTheme;
  // Overrides theme.accent when set; null means "use the theme's own accent".
  accentColorOverride: string | null;
  pageSize: "letter" | "a4";
  headerAlignment: "left" | "center" | "right";
  skillsColumns: 2 | 3 | 4;
  bulletStyle: "•" | "—" | "▪";
  fontSizes: { name: number; heading: number; subheading: number; body: number };
  // 0-100 slider values, mapped to real point ranges at render time — kept
  // as plain 0-100 in storage so the UI sliders stay simple.
  spacing: { section: number; entry: number; line: number; margins: number };
};
