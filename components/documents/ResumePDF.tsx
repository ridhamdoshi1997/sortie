import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import type { Profile } from "@/types";
import type { ResumeSection, ResumeStyle } from "@/types/resumeEditor";

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

export type ResumeTheme = "classic" | "modern" | "minimal";

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
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Spacing sliders are stored 0-100 (simple for the UI) and mapped to real
// point/line-height ranges only at render time.
function mapRange(pct: number, lo: number, hi: number): number {
  return lo + (hi - lo) * (clamp(pct, 0, 100) / 100);
}

function resolveTokens(style: ResumeStyle): ThemeTokens {
  const base = RESUME_THEMES[style.theme];
  if (!style.accentColorOverride) return base;
  return { ...base, accent: style.accentColorOverride, accentDark: style.accentColorOverride };
}

function createStyles(t: ThemeTokens, style: ResumeStyle) {
  const sectionGap = mapRange(style.spacing.section, 8, 32);
  const entryGap = mapRange(style.spacing.entry, 4, 20);
  const lineHeight = mapRange(style.spacing.line, 1.2, 1.8);
  const margin = mapRange(style.spacing.margins, 30, 60);
  // "centered" template always centers the header/section titles — that's
  // the template's whole identity. The headerAlignment knob only applies to
  // "structured"/"split", where the user picks it explicitly.
  const headerAlign = style.template === "centered" ? "center" : style.headerAlignment;
  const nameSize = style.fontSizes.name;
  const headingSize = style.fontSizes.heading;
  const subheadingSize = style.fontSizes.subheading;
  const bodySize = style.fontSizes.body;

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
      borderBottomWidth: 1,
      borderBottomColor: t.rule,
      textAlign: style.template === "centered" ? "center" : "left",
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
    bulletRow: {
      flexDirection: "row",
      marginBottom: 3,
    },
    bulletMark: {
      fontSize: bodySize - 0.5,
      color: t.accent,
      width: 10,
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
  });
}

type Styles = ReturnType<typeof createStyles>;

function renderHeader(profile: Profile, styles: Styles, tokens: ThemeTokens) {
  const contactParts = [profile.email, profile.phone].filter(Boolean);
  const linkParts = [profile.linkedin_url, profile.portfolio_url].filter(Boolean);
  const allContactParts = [...contactParts, ...linkParts];
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
              <Text style={styles.contact}>{part}</Text>
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
  const contactParts = [profile.email, profile.phone, profile.linkedin_url, profile.portfolio_url].filter(Boolean);
  if (contactParts.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Contact</Text>
      {contactParts.map((part, i) => (
        <Text key={i} style={styles.sidebarContactLine}>
          {part}
        </Text>
      ))}
    </View>
  );
}

function renderSection(section: ResumeSection, styles: Styles, tokens: ThemeTokens, bulletMark: string) {
  if (!section.visible) return null;

  if (section.type === "summary") {
    if (!section.content) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>Professional Summary</Text>
        <Text style={styles.summaryText}>{section.content}</Text>
      </View>
    );
  }

  if (section.type === "skills") {
    if (section.items.length === 0) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>Skills</Text>
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
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>Work Experience</Text>
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

  // "education"
  const entries = section.entries.filter((e) => e.degree);
  if (entries.length === 0) return null;
  return (
    <View key={section.id} style={styles.section}>
      <Text style={styles.sectionTitle}>Education</Text>
      {entries.map((e, i) => (
        <View key={i} style={styles.eduEntry}>
          <Text style={styles.eduDegree}>
            {e.degree}
            {e.field ? ` in ${e.field}` : ""}
          </Text>
          <Text style={styles.eduDetails}>{[e.institution, e.graduation_year].filter(Boolean).join("   •   ")}</Text>
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
    const sidebarTypes = new Set<ResumeSection["type"]>(["skills", "education"]);
    const sidebarSections = sections.filter((s) => sidebarTypes.has(s.type));
    const mainSections = sections.filter((s) => !sidebarTypes.has(s.type));
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          <View style={styles.splitRow}>
            <View style={styles.sidebar}>
              {renderSplitSidebarContact(profile, styles)}
              {sidebarSections.map((s) => renderSection(s, styles, tokens, style.bulletStyle))}
            </View>
            <View style={styles.main}>
              {renderSplitMainHeader(profile, styles)}
              {mainSections.map((s) => renderSection(s, styles, tokens, style.bulletStyle))}
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {renderHeader(profile, styles, tokens)}
        {sections.map((s) => renderSection(s, styles, tokens, style.bulletStyle))}
      </Page>
    </Document>
  );
}
