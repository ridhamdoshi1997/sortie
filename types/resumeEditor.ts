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

export type ResumeSection =
  | { id: string; type: "summary"; visible: boolean; content: string }
  | { id: string; type: "skills"; visible: boolean; items: string[] }
  | { id: string; type: "work_experience"; visible: boolean; entries: TailoredWorkEntry[] }
  | { id: string; type: "education"; visible: boolean; entries: Education[] };

export type ResumeSectionType = ResumeSection["type"];

// "structured" is today's single-column layout. "centered" is the same flow
// with a centered header/section titles. "split" is a two-column sidebar
// layout (Contact+Skills+Education in the sidebar, Summary+Work Experience
// in the main column) — modeled on the real LinkedIn-export PDF layout seen
// in this project's own test data, not invented from scratch.
export type ResumeTemplate = "structured" | "centered" | "split";

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
