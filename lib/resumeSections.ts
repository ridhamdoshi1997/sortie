import type { Education, Profile, WorkExperience } from "@/types";
import type { ExtractedProfile } from "@/actions/profile";
import type { ResumeSection, ResumeStyle, ResumeTemplate } from "@/types/resumeEditor";
import type { GeneratedContent, ResumeTheme } from "@/components/documents/ResumePDF";

function newId(): string {
  return crypto.randomUUID();
}

// Builds the initial per-tailored-résumé section snapshot — used both the
// first time a résumé is generated for a job, and lazily for any older
// `applications` row that only has the pre-editor `generated_resume` shape
// (summary + work_experience only). Skills/education were never stored per
// tailored copy before this feature — they're snapshotted fresh from the
// base profile here, and from this point on are independent of it.
export function buildDefaultSections(profile: Profile, generated: GeneratedContent): ResumeSection[] {
  return [
    { id: newId(), type: "summary", visible: true, content: generated.summary ?? "" },
    { id: newId(), type: "skills", visible: (profile.skills?.length ?? 0) > 0, items: profile.skills ?? [] },
    {
      id: newId(),
      type: "work_experience",
      visible: (generated.work_experience?.length ?? 0) > 0,
      entries: (generated.work_experience ?? []).map((w) => ({
        company: w.company,
        title: w.title,
        start_date: w.start_date,
        end_date: w.end_date,
        is_current: w.is_current,
        bullets: w.bullets ?? [],
      })),
    },
    {
      id: newId(),
      type: "education",
      visible: (profile.education ?? []).some((e) => e.degree),
      entries: profile.education ?? [],
    },
    {
      id: newId(),
      type: "certifications",
      // profile.certifications is only ever a flat string[] — issuer/date
      // aren't captured anywhere upstream, so entries start with just a
      // name and the user fills in the rest here if they want to.
      visible: (profile.certifications?.length ?? 0) > 0,
      entries: (profile.certifications ?? []).map((name) => ({ name, issuer: "", date: "" })),
    },
  ];
}

// AI regenerate/revise only ever touches the summary and work-experience
// bullets — skills/education are never AI-authored. On an already-edited
// tailored résumé, this refreshes just those two section types' content in
// place (preserving ids, order, visibility, and any hand-edited
// skills/education) rather than rebuilding the whole array from scratch,
// which would silently discard those edits every time you regenerate.
export function mergeGeneratedContent(
  existing: ResumeSection[] | null,
  generated: GeneratedContent,
  profile: Profile,
): ResumeSection[] {
  if (!existing || existing.length === 0) return buildDefaultSections(profile, generated);

  return existing.map((section) => {
    if (section.type === "summary") {
      return { ...section, content: generated.summary ?? section.content };
    }
    if (section.type === "work_experience") {
      return {
        ...section,
        entries: (generated.work_experience ?? []).map((w) => ({
          company: w.company,
          title: w.title,
          start_date: w.start_date,
          end_date: w.end_date,
          is_current: w.is_current,
          bullets: w.bullets ?? [],
        })),
      };
    }
    return section;
  });
}

// Spacing values are 0-100 slider positions, mapped to real point ranges by
// ResumePDF at render time — these defaults approximate (not guarantee
// pixel-identical to) the fixed layout that predates per-résumé style
// controls; nothing displayed at those exact numbers before this feature
// existed, so an approximate match is fine.
export function buildDefaultStyle(
  preferredTheme: ResumeTheme | null,
  template: ResumeTemplate = "structured",
): ResumeStyle {
  return {
    template,
    theme: preferredTheme ?? "modern",
    accentColorOverride: null,
    // Letter, not A4 — this project's real jobs are Canadian/US postings,
    // where Letter (8.5x11in) is the standard, not the previously-hardcoded A4.
    pageSize: "letter",
    headerAlignment: "left",
    skillsColumns: 3,
    bulletStyle: "—",
    fontSizes: { name: 25, heading: 10.5, subheading: 9.5, body: 9.5 },
    spacing: { section: 40, entry: 35, line: 55, margins: 55 },
  };
}

// extracted_data (résumé slots) stores one free-text responsibilities blob
// per role, not a bullets array — Gemini's extraction generally preserves
// the source PDF's own line breaks for a bulleted résumé, so that's the
// primary split. Falls back to sentence boundaries only when the whole
// thing came back as one dense paragraph (no newlines at all), and never
// fabricates a split for a short blob that's already effectively one bullet.
export function splitResponsibilitiesIntoBullets(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const stripLeadingMarker = (line: string) =>
    line.replace(/^[\s•▪◦\-*→]+/, "").replace(/^\d+[.)]\s*/, "").trim();

  const byLine = trimmed
    .split(/\r?\n/)
    .map(stripLeadingMarker)
    .filter(Boolean);
  if (byLine.length > 1) return byLine;

  if (trimmed.length > 150) {
    const bySentence = trimmed
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (bySentence.length > 1) return bySentence;
  }

  return [trimmed];
}

// One-time conversion from an uploaded résumé slot's flat extracted_data
// into the same ResumeSection[]/ResumeStyle shape a tailored per-job résumé
// already uses — the direct precedent is buildDefaultSections above (profile
// → sections), same idea for a résumé slot's own extraction instead of the
// live profile. Called once, the first time a résumé slot's editing
// workspace is opened with no `sections` saved yet; from that point on the
// slot has its own independent snapshot (resumes.sections/style), same as a
// tailored résumé's — this never re-reads extracted_data again afterward,
// and editing it never writes back to extracted_data (which stays the raw
// extraction used for profile sync).
export function buildSectionsFromExtractedData(extracted: ExtractedProfile): ResumeSection[] {
  return [
    { id: newId(), type: "summary", visible: false, content: "" },
    { id: newId(), type: "skills", visible: extracted.skills.length > 0, items: extracted.skills },
    {
      id: newId(),
      type: "work_experience",
      visible: extracted.work_experience.length > 0,
      entries: extracted.work_experience.map((w: WorkExperience) => ({
        company: w.company,
        title: w.title,
        start_date: w.start_date,
        end_date: w.end_date,
        is_current: w.is_current,
        bullets: splitResponsibilitiesIntoBullets(w.responsibilities || ""),
      })),
    },
    {
      id: newId(),
      type: "education",
      visible: extracted.education.some((e: Education) => e.degree),
      entries: extracted.education,
    },
    {
      id: newId(),
      type: "certifications",
      visible: extracted.certifications.length > 0,
      entries: extracted.certifications.map((name) => ({ name, issuer: "", date: "" })),
    },
  ];
}
