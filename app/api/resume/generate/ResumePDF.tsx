import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import type { Profile } from "@/types";

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
  generated: GeneratedContent;
  theme?: ResumeTheme;
};

// All three themes stay strictly ATS-safe regardless of choice: single
// column, no tables/images, and only the PDF standard-14 fonts (Helvetica /
// Times-Roman families) so nothing needs embedding or trips an ATS parser.
// Only color, font family, and a couple of structural touches (header rule,
// skill chips vs. plain list) vary between themes.
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

function createStyles(t: ThemeTokens) {
  return StyleSheet.create({
    page: {
      paddingTop: 44,
      paddingBottom: 44,
      paddingHorizontal: 46,
      fontFamily: t.fontFamily,
      fontSize: 10,
      color: t.ink,
    },
    header: {
      marginBottom: 14,
    },
    name: {
      fontSize: 25,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
      letterSpacing: t.nameLetterSpacing,
    },
    headerRule: {
      marginTop: 10,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
      width: 46,
    },
    subtitle: {
      fontSize: 11.5,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      marginTop: 8,
    },
    contactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 5,
    },
    contact: {
      fontSize: 9,
      color: t.textMuted,
    },
    contactDivider: {
      fontSize: 9,
      color: t.rule,
      marginHorizontal: 6,
    },
    section: {
      marginTop: 16,
    },
    sectionTitle: {
      fontSize: 10.5,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      letterSpacing: 1.4,
      textTransform: "uppercase",
      paddingBottom: 5,
      marginBottom: 9,
      borderBottomWidth: 1,
      borderBottomColor: t.rule,
    },
    summaryText: {
      fontSize: 10,
      color: t.textSecondary,
      lineHeight: 1.55,
    },
    skillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillChip: {
      fontSize: 8.5,
      color: t.accentDark,
      borderWidth: 0.75,
      borderColor: t.accent,
      borderRadius: 3,
      paddingVertical: 3,
      paddingHorizontal: 7,
      marginRight: 6,
      marginBottom: 6,
    },
    skillPlainText: {
      fontSize: 9.5,
      color: t.textSecondary,
      lineHeight: 1.55,
    },
    jobEntry: {
      marginBottom: 11,
    },
    jobHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 1,
    },
    jobTitle: {
      fontSize: 10.5,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    jobDates: {
      fontSize: 8.5,
      color: t.textMuted,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    jobCompany: {
      fontSize: 9.5,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      marginBottom: 4,
    },
    bulletRow: {
      flexDirection: "row",
      marginBottom: 3,
    },
    bulletMark: {
      fontSize: 9,
      color: t.accent,
      width: 10,
    },
    bulletText: {
      flex: 1,
      fontSize: 9.5,
      color: t.textSecondary,
      lineHeight: 1.45,
    },
    eduDegree: {
      fontSize: 10.5,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    eduDetails: {
      fontSize: 9,
      color: t.textMuted,
      marginTop: 2,
    },
  });
}

export function ResumePDF({ profile, generated, theme = "modern" }: Props) {
  const tokens = RESUME_THEMES[theme];
  const styles = createStyles(tokens);

  const contactParts = [profile.email, profile.phone].filter(Boolean);
  const linkParts = [profile.linkedin_url, profile.portfolio_url].filter(Boolean);
  const allContactParts = [...contactParts, ...linkParts];
  const subtitleParts = [profile.current_title, profile.location].filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.name}>{profile.full_name ?? ""}</Text>
          {tokens.showHeaderRule && <View style={styles.headerRule} />}
          {subtitleParts.length > 0 && (
            <Text style={styles.subtitle}>{subtitleParts.join("   |   ")}</Text>
          )}
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

        {/* Professional Summary */}
        {generated.summary ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Professional Summary</Text>
            <Text style={styles.summaryText}>{generated.summary}</Text>
          </View>
        ) : null}

        {/* Skills */}
        {profile.skills?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Skills</Text>
            {tokens.skillStyle === "chip" ? (
              <View style={styles.skillsRow}>
                {profile.skills.map((skill) => (
                  <Text key={skill} style={styles.skillChip}>
                    {skill}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.skillPlainText}>{profile.skills.join("   •   ")}</Text>
            )}
          </View>
        ) : null}

        {/* Work Experience */}
        {generated.work_experience?.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Work Experience</Text>
            {generated.work_experience.map((job, i) => (
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
                    <Text style={styles.bulletMark}>—</Text>
                    <Text style={styles.bulletText}>{bullet}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        ) : null}

        {/* Education */}
        {profile.education?.some((e) => e.degree) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            {profile.education
              .filter((e) => e.degree)
              .map((e, i) => (
                <View key={i}>
                  <Text style={styles.eduDegree}>
                    {e.degree}
                    {e.field ? ` in ${e.field}` : ""}
                  </Text>
                  <Text style={styles.eduDetails}>
                    {[e.institution, e.graduation_year].filter(Boolean).join("   •   ")}
                  </Text>
                </View>
              ))}
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
