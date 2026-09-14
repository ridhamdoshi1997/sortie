import React from "react";
import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import { toHref } from "@/lib/utils";
import type { Profile } from "@/types";
import { formatDegree, sectionDisplayLabel, type ResumeSection, type ResumeStyle } from "@/types/resumeEditor";

// Still the shape the AI generation/revision pipeline (agent/documents.ts)
// produces — summary + work_experience are the only AI-authored content;
// skills/education are never AI-written, only ever pulled from the profile
// or hand-edited in the workspace. Callers merge this into a full
// ResumeSection[] via lib/resumeSections.ts before rendering.
export type GeneratedContent = {
  summary: string;
  work_experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    bullets: string[];
  }>;
};

export type ResumeTheme = "classic" | "modern" | "minimal" | "slate" | "editorial" | "sage";

type Props = {
  profile: Profile;
  sections: ResumeSection[];
  style: ResumeStyle;
};

// All three themes stay strictly ATS-safe regardless of choice: no
// tables/images, and only the PDF standard-14 fonts (Helvetica / Times-Roman
// families) so nothing needs embedding or trips an ATS parser. That
// constraint is preserved by every template/style knob added on top of it —
// none of them introduce a custom font or a non-standard page structure an
// ATS parser can't read.
export type ThemeTokens = {
  fontFamily: string;
  fontFamilyBold: string;
  accent: string;
  accentDark: string;
  ink: string;
  textSecondary: string;
  textMuted: string;
  rule: string;
  showHeaderRule: boolean;
  skillStyle: "chip" | "plain";
  nameLetterSpacing: number;
};

export const RESUME_THEMES: Record<ResumeTheme, ThemeTokens> = {
  // Echoes the app's own light-mode accent (--color-accent / --color-accent-dark
  // in app/globals.css) so this default feels on-brand.
  modern: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#c9711f",
    accentDark: "#7a4713",
    ink: "#17181a",
    textSecondary: "#4b4f4c",
    textMuted: "#7a7f7c",
    rule: "#e4e2dc",
    showHeaderRule: true,
    skillStyle: "chip",
    nameLetterSpacing: 0.3,
  },
  // Traditional serif treatment for conservative industries (finance, legal,
  // academia) — plain skill list instead of chips reads less "startup."
  classic: {
    fontFamily: "Times-Roman",
    fontFamilyBold: "Times-Bold",
    accent: "#1f3a5f",
    accentDark: "#13253d",
    ink: "#1a1a1a",
    textSecondary: "#3a3a3a",
    textMuted: "#6b6b6b",
    rule: "#c7c7c7",
    showHeaderRule: true,
    skillStyle: "plain",
    nameLetterSpacing: 0.5,
  },
  // Pure grayscale — no color at all, for the most conservative ATS/print
  // scenarios or anyone who wants zero visual risk.
  minimal: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#1a1a1a",
    accentDark: "#000000",
    ink: "#1a1a1a",
    textSecondary: "#3a3a3a",
    textMuted: "#7a7a7a",
    rule: "#dcdcdc",
    showHeaderRule: false,
    skillStyle: "plain",
    nameLetterSpacing: 1.2,
  },
  // Researched via agy 2026-08-06: a tech-forward, high-contrast theme —
  // steel blue/dark slate accent, airy letter-spacing on the name.
  slate: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#4682b4",
    accentDark: "#2f4f4f",
    ink: "#1a1a24",
    textSecondary: "#4a5568",
    textMuted: "#a0aec0",
    rule: "#e2e8f0",
    showHeaderRule: true,
    skillStyle: "chip",
    nameLetterSpacing: 1.5,
  },
  // A striking, authoritative serif theme — deep crimson accent on pure
  // black ink, heavy rules, tight classic letter-spacing.
  editorial: {
    fontFamily: "Times-Roman",
    fontFamilyBold: "Times-Bold",
    accent: "#8b0000",
    accentDark: "#5c0000",
    ink: "#000000",
    textSecondary: "#333333",
    textMuted: "#666666",
    rule: "#000000",
    showHeaderRule: true,
    skillStyle: "plain",
    nameLetterSpacing: 0,
  },
  // An approachable, organic theme — sea green/forest accent, no header
  // rule (softer than slate/editorial).
  sage: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#2e8b57",
    accentDark: "#004d26",
    ink: "#222222",
    textSecondary: "#555555",
    textMuted: "#888888",
    rule: "#d9d9d9",
    showHeaderRule: false,
    skillStyle: "chip",
    nameLetterSpacing: 1.0,
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Spacing sliders are stored 0-100 (simple for the UI) and mapped to real
// point/line-height ranges only at render time. Exported so StyleTab can
// show the same real units (pt / line-height) next to each slider instead of
// a meaningless raw 0-100 number.
export function mapRange(pct: number, lo: number, hi: number): number {
  return lo + (hi - lo) * (clamp(pct, 0, 100) / 100);
}

export const SPACING_RANGES = {
  section: [8, 32] as const,
  entry: [4, 20] as const,
  line: [1.2, 1.8] as const,
  margins: [30, 60] as const,
};

// Exported so CoverLetterPDF can resolve the same accent-override logic
// against the shared ResumeStyle it now takes instead of a bare theme name.
export function resolveTokens(style: ResumeStyle): ThemeTokens {
  const base = RESUME_THEMES[style.theme];
  if (!style.accentColorOverride) return base;
  return { ...base, accent: style.accentColorOverride, accentDark: style.accentColorOverride };
}

function createStyles(t: ThemeTokens, style: ResumeStyle) {
  const sectionGap = mapRange(style.spacing.section, ...SPACING_RANGES.section);
  const entryGap = mapRange(style.spacing.entry, ...SPACING_RANGES.entry);
  const lineHeight = mapRange(style.spacing.line, ...SPACING_RANGES.line);
  const margin = mapRange(style.spacing.margins, ...SPACING_RANGES.margins);
  // "centered" and "block" always center the header/section titles — that's
  // core to both templates' identity (block's banner is designed centered).
  // The headerAlignment knob only applies to the templates where the user
  // actually picks it (structured/split/timeline/executive).
  const alwaysCentered = style.template === "centered" || style.template === "block";
  const headerAlign = alwaysCentered ? "center" : style.headerAlignment;
  const nameSize = style.fontSizes.name;
  const headingSize = style.fontSizes.heading;
  const subheadingSize = style.fontSizes.subheading;
  const bodySize = style.fontSizes.body;

  // Gutter width is per-GLYPH, not one number for all three.
  //
  // The three allowed marks (• — ▪) have very different advance widths: an
  // em dash is roughly a full em, a round bullet closer to a third. A single
  // shared width either crowds the dash against the text (observed live —
  // "—Led the migration" with no gap at all) or leaves a canyon after a
  // round bullet. Each multiplier is glyph width plus a deliberate ~0.5em
  // of separation.
  const BULLET_GUTTER_EM: Record<ResumeStyle["bulletStyle"], number> = {
    "•": 0.9,
    "▪": 1.05,
    "—": 1.7,
  };
  const bulletGutter = bodySize * (BULLET_GUTTER_EM[style.bulletStyle] ?? 1.0);

  return StyleSheet.create({
    page: {
      paddingTop: margin,
      paddingBottom: margin,
      paddingHorizontal: margin,
      fontFamily: t.fontFamily,
      fontSize: bodySize,
      color: t.ink,
    },
    header: {
      marginBottom: 14,
      alignItems: headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    },
    name: {
      fontSize: nameSize,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
      letterSpacing: t.nameLetterSpacing,
      textAlign: headerAlign,
    },
    headerRule: {
      marginTop: 10,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
      width: 46,
    },
    subtitle: {
      fontSize: subheadingSize + 1.5,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      marginTop: 8,
      textAlign: headerAlign,
    },
    contactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 5,
      justifyContent: headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    },
    contact: {
      fontSize: bodySize - 1,
      color: t.textMuted,
    },
    contactDivider: {
      fontSize: bodySize - 1,
      color: t.rule,
      marginHorizontal: 6,
    },
    sidebarContactLine: {
      fontSize: bodySize - 1,
      color: t.textMuted,
      marginBottom: 4,
    },
    section: {
      marginTop: sectionGap,
    },
    sectionTitle: {
      fontSize: headingSize,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      paddingBottom: 5,
      marginBottom: 9,
      borderBottomWidth: style.template === "block" ? 2.5 : 1,
      borderBottomColor: style.template === "block" ? t.accent : t.rule,
      textAlign: alwaysCentered ? "center" : "left",
    },
    summaryText: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
    },
    skillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillChip: {
      fontSize: bodySize - 1,
      color: t.accentDark,
      borderWidth: 0.75,
      borderColor: t.accent,
      borderRadius: 3,
      paddingVertical: 3,
      paddingHorizontal: 7,
      marginRight: 6,
      marginBottom: 6,
    },
    skillPlainGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillPlainItem: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
      width: `${100 / style.skillsColumns}%`,
      marginBottom: 3,
    },
    jobEntry: {
      marginBottom: entryGap,
    },
    jobHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 1,
    },
    jobTitle: {
      fontSize: subheadingSize,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    jobDates: {
      fontSize: bodySize - 1,
      color: t.textMuted,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    jobCompany: {
      fontSize: subheadingSize - 1,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      marginBottom: 4,
    },
    // Bullet alignment, rebuilt 2026-09-11 after a direct user report that
    // bullets sat "in the middle and sometimes completely off".
    //
    // Three separate causes, all of them in these three rules:
    //
    //  1. The mark and the text are sibling <Text> nodes, and only the text
    //     carried a lineHeight. Two text runs with different line heights
    //     do not share a baseline, so the glyph floated against the first
    //     line — visibly high on tight line spacing, low on loose.
    //  2. flexDirection "row" defaults to alignItems "stretch", so on any
    //     bullet that wrapped to two or more lines the mark's box stretched
    //     the full height and its glyph drifted toward the vertical middle
    //     of the paragraph instead of sitting on line one.
    //  3. width was a hard 10pt regardless of font size. The three allowed
    //     glyphs (• — ▪) have very different widths, and an em dash at a
    //     larger body size overflowed its box and pushed into the text.
    //
    // Fixed by giving the mark the SAME lineHeight as the text (shared
    // baseline), pinning the row to flex-start (mark stays on line one),
    // and scaling the gutter with the font so it holds at every size.
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: 3,
    },
    bulletMark: {
      fontSize: bodySize - 0.5,
      color: t.accent,
      width: bulletGutter,
      flexShrink: 0,
      lineHeight: lineHeight - 0.1,
    },
    bulletText: {
      flex: 1,
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight: lineHeight - 0.1,
    },
    eduEntry: {
      marginBottom: entryGap * 0.6,
    },
    eduDegree: {
      fontSize: subheadingSize,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    eduDetails: {
      fontSize: bodySize - 1,
      color: t.textMuted,
      marginTop: 2,
    },
    splitRow: {
      flexDirection: "row",
    },
    sidebar: {
      width: "32%",
      paddingRight: 14,
    },
    main: {
      width: "68%",
      paddingLeft: 18,
    },
    // "executive" — mirrors split's two-column row, but sidebar on the
    // RIGHT (65/35, not 32/68) and no contact block inside it — contact
    // already lives in the full-width header rendered above this row.
    executiveMain: {
      width: "65%",
      paddingRight: 18,
    },
    executiveSidebar: {
      width: "35%",
      paddingLeft: 14,
    },
    // "timeline" — work-experience entries get a dedicated date column
    // instead of a title/dates header row.
    timelineJobEntry: {
      flexDirection: "row",
      marginBottom: entryGap,
    },
    timelineDateCol: {
      width: "20%",
      paddingRight: 8,
    },
    timelineDateText: {
      fontSize: bodySize - 1,
      color: t.textMuted,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    timelineContentCol: {
      width: "80%",
    },
    // "block" — solid-color header banner, inset within the page margins
    // rather than full-bleed (react-pdf's Yoga layout doesn't handle
    // negative-margin edge-bleed reliably, so this stays a "card" instead).
    // Text is hardcoded white — it sits on accentDark regardless of theme,
    // so it can't use the theme's normal ink/textMuted tokens.
    blockHeader: {
      backgroundColor: t.accentDark,
      borderRadius: 4,
      paddingVertical: 18,
      paddingHorizontal: 20,
      marginBottom: 16,
      alignItems: headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    },
    blockName: {
      fontSize: nameSize,
      fontFamily: t.fontFamilyBold,
      color: "#ffffff",
      letterSpacing: t.nameLetterSpacing,
      textAlign: headerAlign,
    },
    blockSubtitle: {
      fontSize: subheadingSize + 1.5,
      fontFamily: t.fontFamilyBold,
      color: "#ffffff",
      marginTop: 6,
      textAlign: headerAlign,
      opacity: 0.92,
    },
    blockContactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 6,
      justifyContent: headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    },
    blockContact: {
      fontSize: bodySize - 1,
      color: "#ffffff",
      opacity: 0.85,
    },
    blockContactDivider: {
      fontSize: bodySize - 1,
      color: "#ffffff",
      opacity: 0.5,
      marginHorizontal: 6,
    },
  });
}

type Styles = ReturnType<typeof createStyles>;

// Résumé header contact info mixes plain text (email/phone) with real URLs
// (LinkedIn/portfolio-or-GitHub) — carrying an optional href alongside each
// part lets every render site below wrap only the link entries in
// @react-pdf/renderer's <Link>, leaving the plain-text entries untouched.
// The visible text is unchanged either way, so this doesn't affect ATS
// text-extraction, only adds a clickable annotation on top of it.
type ContactPart = { text: string; href?: string };

function contactPartsWithLinks(profile: Profile): ContactPart[] {
  const plain: ContactPart[] = [profile.email, profile.phone].filter((v): v is string => Boolean(v)).map((text) => ({ text }));
  const links: ContactPart[] = [profile.linkedin_url, profile.portfolio_url]
    .filter((v): v is string => Boolean(v))
    .map((text) => ({ text, href: toHref(text) }));
  return [...plain, ...links];
}

function ContactText({ part, style }: { part: ContactPart; style: Style }) {
  if (part.href) {
    return (
      <Link src={part.href} style={style}>
        {part.text}
      </Link>
    );
  }
  return <Text style={style}>{part.text}</Text>;
}

function renderHeader(profile: Profile, styles: Styles, tokens: ThemeTokens) {
  const allContactParts = contactPartsWithLinks(profile);
  const subtitleParts = [profile.current_title, profile.location].filter(Boolean);

  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.full_name ?? ""}</Text>
      {tokens.showHeaderRule && <View style={styles.headerRule} />}
      {subtitleParts.length > 0 && <Text style={styles.subtitle}>{subtitleParts.join("   |   ")}</Text>}
      {allContactParts.length > 0 && (
        <View style={styles.contactRow}>
          {allContactParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={styles.contactDivider}>•</Text>}
              <ContactText part={part} style={styles.contact} />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

// "block" — a solid-color banner instead of a plain header. Text is
// hardcoded white via the block* style keys (createStyles), not the theme's
// normal ink/textMuted tokens, since it sits on accentDark regardless of
// theme choice.
function renderBlockHeader(profile: Profile, styles: Styles) {
  const allContactParts = contactPartsWithLinks(profile);
  const subtitleParts = [profile.current_title, profile.location].filter(Boolean);

  return (
    <View style={styles.blockHeader}>
      <Text style={styles.blockName}>{profile.full_name ?? ""}</Text>
      {subtitleParts.length > 0 && <Text style={styles.blockSubtitle}>{subtitleParts.join("   |   ")}</Text>}
      {allContactParts.length > 0 && (
        <View style={styles.blockContactRow}>
          {allContactParts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={styles.blockContactDivider}>•</Text>}
              <ContactText part={part} style={styles.blockContact} />
            </React.Fragment>
          ))}
        </View>
      )}
    </View>
  );
}

// The "split" template moves name/title into the main column (matching the
// real LinkedIn-export résumé layout this project's own test data already
// showed) and contact details into the sidebar instead — a single shared
// header block doesn't fit that layout, so it gets its own two pieces.
function renderSplitMainHeader(profile: Profile, styles: Styles) {
  const subtitleParts = [profile.current_title, profile.location].filter(Boolean);
  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.full_name ?? ""}</Text>
      {subtitleParts.length > 0 && <Text style={styles.subtitle}>{subtitleParts.join("   |   ")}</Text>}
    </View>
  );
}

function renderSplitSidebarContact(profile: Profile, styles: Styles) {
  const contactParts = contactPartsWithLinks(profile);
  if (contactParts.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Contact</Text>
      {contactParts.map((part, i) => (
        <ContactText key={i} part={part} style={styles.sidebarContactLine} />
      ))}
    </View>
  );
}

function renderSection(section: ResumeSection, styles: Styles, tokens: ThemeTokens, style: ResumeStyle) {
  const bulletMark = style.bulletStyle;
  if (!section.visible) return null;

  if (section.type === "summary") {
    if (!section.content) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Professional Summary")}</Text>
        <Text style={styles.summaryText}>{section.content}</Text>
      </View>
    );
  }

  if (section.type === "skills") {
    if (section.items.length === 0) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Skills")}</Text>
        {tokens.skillStyle === "chip" ? (
          <View style={styles.skillsRow}>
            {section.items.map((skill) => (
              <Text key={skill} style={styles.skillChip}>
                {skill}
              </Text>
            ))}
          </View>
        ) : (
          <View style={styles.skillPlainGrid}>
            {section.items.map((skill) => (
              <Text key={skill} style={styles.skillPlainItem}>
                {skill}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (section.type === "work_experience") {
    if (section.entries.length === 0) return null;
    // "timeline" gets a dedicated date column per entry instead of a
    // title/dates header row — everything else (title/company/bullets)
    // stacks in the remaining content column.
    if (style.template === "timeline") {
      return (
        <View key={section.id} style={styles.section}>
          <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Work Experience")}</Text>
          {section.entries.map((job, i) => (
            <View key={i} style={styles.timelineJobEntry}>
              <View style={styles.timelineDateCol}>
                <Text style={styles.timelineDateText}>
                  {job.start_date} – {job.is_current ? "Present" : (job.end_date ?? "")}
                </Text>
              </View>
              <View style={styles.timelineContentCol}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                <Text style={styles.jobCompany}>{job.company}</Text>
                {job.bullets?.map((bullet, j) => (
                  <View key={j} style={styles.bulletRow}>
                    <Text style={styles.bulletMark}>{bulletMark}</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Work Experience")}</Text>
        {section.entries.map((job, i) => (
          <View key={i} style={styles.jobEntry}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobTitle}>{job.title}</Text>
              <Text style={styles.jobDates}>
                {job.start_date} – {job.is_current ? "Present" : (job.end_date ?? "")}
              </Text>
            </View>
            <Text style={styles.jobCompany}>{job.company}</Text>
            {job.bullets?.map((bullet, j) => (
              <View key={j} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>{bulletMark}</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  if (section.type === "education") {
    const entries = section.entries.filter((e) => e.degree);
    if (entries.length === 0) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Education")}</Text>
        {entries.map((e, i) => (
          <View key={i} style={styles.eduEntry}>
            <Text style={styles.eduDegree}>{formatDegree(e.degree, e.field)}</Text>
            <Text style={styles.eduDetails}>{[e.institution, e.graduation_year].filter(Boolean).join("   •   ")}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (section.type === "certifications") {
    const entries = section.entries.filter((e) => e.name);
    if (entries.length === 0) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Certifications")}</Text>
        {entries.map((e, i) => (
          <View key={i} style={styles.eduEntry}>
            <Text style={styles.eduDegree}>{e.name}</Text>
            {(e.issuer || e.date) && (
              <Text style={styles.eduDetails}>{[e.issuer, e.date].filter(Boolean).join("   •   ")}</Text>
            )}
          </View>
        ))}
      </View>
    );
  }

  // "custom" — a user-defined section (Projects/Languages/Awards/Volunteer
  // Experience/blank). Reuses the same jobEntry-style layout as Work
  // Experience (title/subtitle-date header + bullets), since that generic
  // shape covers the large majority of real custom-section content without
  // a bespoke data model per preset (per the research pass).
  const entries = section.entries.filter((e) => e.title || e.subtitle || e.bullets.some(Boolean));
  if (entries.length === 0) return null;
  return (
    <View key={section.id} style={styles.section}>
      <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Custom Section")}</Text>
      {entries.map((entry, i) => (
        <View key={i} style={styles.jobEntry}>
          <View style={styles.jobHeader}>
            <Text style={styles.jobTitle}>{entry.title}</Text>
            {entry.date && <Text style={styles.jobDates}>{entry.date}</Text>}
          </View>
          {entry.subtitle && <Text style={styles.jobCompany}>{entry.subtitle}</Text>}
          {entry.bullets?.map(
            (bullet, j) =>
              bullet && (
                <View key={j} style={styles.bulletRow}>
                  <Text style={styles.bulletMark}>{bulletMark}</Text>
                  <Text style={styles.bulletText}>{bullet}</Text>
                </View>
              ),
          )}
        </View>
      ))}
    </View>
  );
}

export function ResumePDF({ profile, sections, style }: Props) {
  const tokens = resolveTokens(style);
  const styles = createStyles(tokens, style);
  const pageSize = style.pageSize === "a4" ? "A4" : "LETTER";

  if (style.template === "split") {
    const sidebarTypes = new Set<ResumeSection["type"]>(["skills", "education", "certifications"]);
    const sidebarSections = sections.filter((s) => sidebarTypes.has(s.type));
    const mainSections = sections.filter((s) => !sidebarTypes.has(s.type));
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          <View style={styles.splitRow}>
            <View style={styles.sidebar}>
              {renderSplitSidebarContact(profile, styles)}
              {sidebarSections.map((s) => renderSection(s, styles, tokens, style))}
            </View>
            <View style={styles.main}>
              {renderSplitMainHeader(profile, styles)}
              {mainSections.map((s) => renderSection(s, styles, tokens, style))}
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  // "executive" — like split, but the sidebar sits on the RIGHT (65/35) and
  // the header is full-width, rendered ABOVE the two-column row rather than
  // living inside the sidebar column (contact is already covered by the
  // full-width header, so no separate sidebar-contact block is needed here).
  if (style.template === "executive") {
    const sidebarTypes = new Set<ResumeSection["type"]>(["skills", "education", "certifications"]);
    const sidebarSections = sections.filter((s) => sidebarTypes.has(s.type));
    const mainSections = sections.filter((s) => !sidebarTypes.has(s.type));
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          {renderHeader(profile, styles, tokens)}
          <View style={styles.splitRow}>
            <View style={styles.executiveMain}>{mainSections.map((s) => renderSection(s, styles, tokens, style))}</View>
            <View style={styles.executiveSidebar}>{sidebarSections.map((s) => renderSection(s, styles, tokens, style))}</View>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {style.template === "block" ? renderBlockHeader(profile, styles) : renderHeader(profile, styles, tokens)}
        {sections.map((s) => renderSection(s, styles, tokens, style))}
      </Page>
    </Document>
  );
}
