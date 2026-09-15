import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import { formatDate } from "@/lib/utils";
import { stripLeadingGreeting } from "@/lib/coverLetterText";
import { resolveTokens, spacingPt, type ResolvedTokens } from "@/components/documents/ResumePDF";
import type { Profile } from "@/types";
import type { ResumeStyle } from "@/types/resumeEditor";

type Props = {
  profile: Profile;
  company: string | null;
  letterBody: string;
  // Cover letters share the tailored résumé's exact ResumeStyle (same
  // template+theme for one job application) rather than an independent
  // style choice — researched via agy: real products (Novoresume, Enhancv,
  // Zety) treat résumé+cover-letter as one visually matched suite, and
  // mismatched styling across the two documents reads as unprofessional.
  style: ResumeStyle;
  // Null/omitted renders the computed default ("Hiring Team, {company}") —
  // set to let the user address a specific hiring manager by name.
  salutation?: string | null;
};

function createStyles(t: ResolvedTokens, style: ResumeStyle, headerAlign: "left" | "center" | "right") {
  const margin = spacingPt(style, "margins") + 18;
  const lineHeight = spacingPt(style, "line");
  return StyleSheet.create({
    page: {
      padding: margin,
      ...t.regular,
      fontSize: style.fontSizes.body,
      color: t.ink,
    },
    header: {
      alignItems: headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    },
    name: {
      fontSize: style.fontSizes.name * 0.64,
      ...t.bold,
      color: t.ink,
      letterSpacing: t.nameLetterSpacing,
      textAlign: headerAlign,
    },
    contact: {
      fontSize: style.fontSizes.body - 1.5,
      color: t.textMuted,
      marginTop: 3,
      textAlign: headerAlign,
    },
    date: {
      fontSize: style.fontSizes.body,
      color: t.textMuted,
      marginTop: 28,
      textAlign: headerAlign,
    },
    recipient: {
      fontSize: style.fontSizes.body,
      color: t.textMuted,
      marginTop: 4,
      textAlign: headerAlign,
    },
    paragraph: {
      fontSize: style.fontSizes.body,
      color: t.textSecondary,
      marginTop: 14,
      lineHeight,
    },
    splitRow: {
      flexDirection: "row",
    },
    sidebar: {
      width: "30%",
      paddingRight: 14,
    },
    sidebarTitle: {
      fontSize: style.fontSizes.heading - 1,
      ...t.bold,
      color: t.accentDark,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 6,
    },
    sidebarTitleSecond: {
      fontSize: style.fontSizes.heading - 1,
      ...t.bold,
      color: t.accentDark,
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginBottom: 6,
      marginTop: 14,
    },
    sidebarLine: {
      fontSize: style.fontSizes.body - 1,
      color: t.textMuted,
      marginBottom: 4,
    },
    main: {
      width: "70%",
      paddingLeft: 18,
    },
  });
}

type Styles = ReturnType<typeof createStyles>;

function renderHeader(profile: Profile, styles: Styles) {
  const contactParts = [profile.email, profile.phone].filter(Boolean);
  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.full_name ?? ""}</Text>
      {contactParts.length > 0 && <Text style={styles.contact}>{contactParts.join("  •  ")}</Text>}
    </View>
  );
}

function renderBody(company: string | null, salutation: string | null | undefined, paragraphs: string[], styles: Styles) {
  return (
    <>
      <Text style={styles.date}>{formatDate(new Date())}</Text>
      <Text style={styles.recipient}>{salutation?.trim() || `Hiring Team${company ? `, ${company}` : ""}`}</Text>
      <View>
        {paragraphs.map((paragraph, i) => (
          <Text key={i} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </View>
    </>
  );
}

export function CoverLetterPDF({ profile, company, letterBody, style, salutation }: Props) {
  const tokens = resolveTokens(style);
  // "centered"/"block" center the header, same as ResumePDF's own
  // alwaysCentered logic; everything else honors the shared headerAlignment.
  const headerAlign =
    style.template === "centered" || style.template === "block" || style.template === "professional" || style.template === "early_career"
      ? "center"
      : style.headerAlignment;
  const styles = createStyles(tokens, style, headerAlign);
  const pageSize = style.pageSize === "a4" ? "A4" : "LETTER";
  // The salutation is printed above from its own field; a greeting the body
  // also opens with (every letter generated before 2026-09-15) is dropped.
  const paragraphs = stripLeadingGreeting(letterBody)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  // "split" keeps a left sidebar (contact + a short skills list, pulled
  // from the base profile — a cover letter isn't tied to one tailored
  // résumé's specific edited skill set) — the one structural variant a
  // letter's simple content genuinely supports well, per the research pass.
  if (style.template === "split") {
    const contactParts = [profile.email, profile.phone].filter(Boolean);
    const skills = (profile.skills ?? []).slice(0, 8);
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          <View style={styles.splitRow}>
            <View style={styles.sidebar}>
              <Text style={styles.sidebarTitle}>Contact</Text>
              {contactParts.map((part, i) => (
                <Text key={i} style={styles.sidebarLine}>
                  {part}
                </Text>
              ))}
              {skills.length > 0 && (
                <>
                  <Text style={styles.sidebarTitleSecond}>Core Skills</Text>
                  {skills.map((skill) => (
                    <Text key={skill} style={styles.sidebarLine}>
                      {skill}
                    </Text>
                  ))}
                </>
              )}
            </View>
            <View style={styles.main}>
              <Text style={styles.name}>{profile.full_name ?? ""}</Text>
              {renderBody(company, salutation, paragraphs, styles)}
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {renderHeader(profile, styles)}
        {renderBody(company, salutation, paragraphs, styles)}
      </Page>
    </Document>
  );
}
