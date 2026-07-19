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

type Props = {
  profile: Profile;
  generated: GeneratedContent;
};

// Echoes the app's own light-mode accent (--color-accent / --color-accent-dark
// in app/globals.css) so a generated resume feels on-brand — hardcoded here
// deliberately, since react-pdf styles are plain JS objects, not CSS, and
// can't read the app's Tailwind theme variables.
const ACCENT = "#c9711f";
const ACCENT_DARK = "#7a4713";
const INK = "#17181a";
const TEXT_SECONDARY = "#4b4f4c";
const TEXT_MUTED = "#7a7f7c";
const RULE = "#e4e2dc";

const styles = StyleSheet.create({
  page: {
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 46,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: INK,
  },
  header: {
    marginBottom: 14,
  },
  name: {
    fontSize: 25,
    fontFamily: "Helvetica-Bold",
    color: INK,
    letterSpacing: 0.3,
  },
  headerRule: {
    marginTop: 10,
    borderBottomWidth: 2,
    borderBottomColor: ACCENT,
    width: 46,
  },
  subtitle: {
    fontSize: 11.5,
    fontFamily: "Helvetica-Bold",
    color: ACCENT_DARK,
    marginTop: 8,
  },
  contactRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 5,
  },
  contact: {
    fontSize: 9,
    color: TEXT_MUTED,
  },
  contactDivider: {
    fontSize: 9,
    color: RULE,
    marginHorizontal: 6,
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: ACCENT_DARK,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    paddingBottom: 5,
    marginBottom: 9,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  summaryText: {
    fontSize: 10,
    color: TEXT_SECONDARY,
    lineHeight: 1.55,
  },
  skillsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  skillChip: {
    fontSize: 8.5,
    color: ACCENT_DARK,
    borderWidth: 0.75,
    borderColor: ACCENT,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 7,
    marginRight: 6,
    marginBottom: 6,
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
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  jobDates: {
    fontSize: 8.5,
    color: TEXT_MUTED,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  jobCompany: {
    fontSize: 9.5,
    fontFamily: "Helvetica-Bold",
    color: ACCENT_DARK,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: "row",
    marginBottom: 3,
  },
  bulletMark: {
    fontSize: 9,
    color: ACCENT,
    width: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 9.5,
    color: TEXT_SECONDARY,
    lineHeight: 1.45,
  },
  eduDegree: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: INK,
  },
  eduDetails: {
    fontSize: 9,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});

export function ResumePDF({ profile, generated }: Props) {
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
          <View style={styles.headerRule} />
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
            <View style={styles.skillsRow}>
              {profile.skills.map((skill) => (
                <Text key={skill} style={styles.skillChip}>
                  {skill}
                </Text>
              ))}
            </View>
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
        {profile.education?.degree ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Education</Text>
            <Text style={styles.eduDegree}>
              {profile.education.degree}
              {profile.education.field ? ` in ${profile.education.field}` : ""}
            </Text>
            <Text style={styles.eduDetails}>
              {[profile.education.institution, profile.education.graduation_year]
                .filter(Boolean)
                .join("   •   ")}
            </Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
