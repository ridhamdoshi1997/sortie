import { toHref } from "@/lib/utils";
import type { Education, Profile } from "@/types";
import type { CertificationEntry, ResumeSection, ResumeStyle, ResumeTemplate, SkillGroup } from "@/types/resumeEditor";

/** Every skill in a skills section: grouped ones first, then ungrouped. */
export function allSkills(section: { items: string[]; groups?: SkillGroup[] }): string[] {
  return [...(section.groups ?? []).flatMap((g) => g.items), ...section.items].map((s) => s.trim()).filter(Boolean);
}

// Layout decisions shared by the PDF (ResumePDF.tsx) and the Word export
// (lib/resumeDocx.ts), so the two files can never disagree about what goes
// where. Nothing here renders; it only decides.

export type SkillsDisplay = "chips" | "grid" | "grouped" | "bulleted";

/** The skills layout in effect: the style's explicit choice, else the theme's chips/grid. */
export function resolveSkillsDisplay(style: ResumeStyle, themeSkillStyle: "chip" | "plain"): SkillsDisplay {
  if (style.skillsDisplay && style.skillsDisplay !== "theme") return style.skillsDisplay;
  return themeSkillStyle === "chip" ? "chips" : "grid";
}

/** The compact centered header with capitals, a pipe-separated contact line and room for highlights. */
export function usesCompactHeader(template: ResumeTemplate): boolean {
  return template === "professional" || template === "early_career";
}

export type ContactPart = { text: string; href?: string; kind: "location" | "phone" | "email" | "link" };

/**
 * Contact line parts. The original templates print email • phone • links and
 * put the location in the subtitle; the compact-header templates lead with the
 * location and keep the subtitle for the title alone.
 */
export function headerContactParts(profile: Profile, template: ResumeTemplate): ContactPart[] {
  const parts: ContactPart[] = [];
  if (usesCompactHeader(template) && profile.location) parts.push({ text: profile.location, kind: "location" });
  if (usesCompactHeader(template)) {
    if (profile.phone) parts.push({ text: profile.phone, kind: "phone" });
    if (profile.email) parts.push({ text: profile.email, kind: "email" });
  } else {
    if (profile.email) parts.push({ text: profile.email, kind: "email" });
    if (profile.phone) parts.push({ text: profile.phone, kind: "phone" });
  }
  for (const url of [profile.linkedin_url, profile.portfolio_url]) {
    if (url) parts.push({ text: url, href: toHref(url), kind: "link" });
  }
  return parts;
}

/** Subtitle under the name. */
export function headerSubtitle(profile: Profile, template: ResumeTemplate): string {
  if (usesCompactHeader(template)) return profile.current_title ?? "";
  return [profile.current_title, profile.location].filter(Boolean).join("   |   ");
}

/** Visible highlight items, printed as a strip under the header. */
export function highlightItems(sections: ResumeSection[]): string[] {
  const section = sections.find((s) => s.type === "highlights");
  if (!section || section.type !== "highlights" || !section.visible) return [];
  return section.items.map((i) => i.trim()).filter(Boolean);
}

/** "2019 – 2020", or the single year when only one is known. */
export function educationYears(entry: Education): string {
  return [entry.start_year, entry.graduation_year].map((v) => (v ?? "").trim()).filter(Boolean).join(" – ");
}

/** "Name, Issuer (Date)" with empty parts left out. */
export function certificationText(entry: CertificationEntry): string {
  const head = [entry.name, entry.issuer].map((v) => v.trim()).filter(Boolean).join(", ");
  return entry.date.trim() ? `${head} (${entry.date.trim()})` : head;
}

export function dateRange(start: string, end: string | null, isCurrent: boolean): string {
  const to = isCurrent ? "Present" : (end ?? "").trim();
  return [start.trim(), to].filter(Boolean).join(" – ");
}

// ---------------------------------------------------------------------------
// Bold inside text. Users mark it with **double asterisks**, the same markup
// the Markdown export already uses. The stored text stays plain, so ATS
// parsing and every AI prompt read it unchanged.
// ---------------------------------------------------------------------------

export type RichRun = { text: string; bold: boolean };

export function parseRich(text: string): RichRun[] {
  const runs: RichRun[] = [];
  text.split(/\*\*(.+?)\*\*/g).forEach((part, i) => {
    if (part) runs.push({ text: part, bold: i % 2 === 1 });
  });
  return runs.length > 0 ? runs : [{ text: "", bold: false }];
}

export function stripRich(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, "$1");
}
