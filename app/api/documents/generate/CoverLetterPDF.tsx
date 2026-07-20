import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import { formatDate } from "@/lib/utils";
import { RESUME_THEMES, type ResumeTheme } from "@/app/api/resume/generate/ResumePDF";
import type { Profile } from "@/types";

type Props = {
  profile: Profile;
  company: string | null;
  letterBody: string;
  theme?: ResumeTheme;
};

function createStyles(t: (typeof RESUME_THEMES)[ResumeTheme]) {
  return StyleSheet.create({
    page: {
      padding: 48,
      fontFamily: t.fontFamily,
      fontSize: 10.5,
      color: t.ink,
    },
    name: {
      fontSize: 16,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    contact: {
      fontSize: 9,
      color: t.textMuted,
      marginTop: 3,
    },
    date: {
      fontSize: 10,
      color: t.textMuted,
      marginTop: 28,
    },
    recipient: {
      fontSize: 10,
      color: t.textMuted,
      marginTop: 4,
    },
    paragraph: {
      fontSize: 10.5,
      color: t.textSecondary,
      marginTop: 14,
      lineHeight: 1.6,
    },
  });
}

export function CoverLetterPDF({ profile, company, letterBody, theme = "modern" }: Props) {
  const styles = createStyles(RESUME_THEMES[theme]);
  const contactParts = [profile.email, profile.phone].filter(Boolean);
  const paragraphs = letterBody
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.name}>{profile.full_name ?? ""}</Text>
          {contactParts.length > 0 && (
            <Text style={styles.contact}>{contactParts.join("  •  ")}</Text>
          )}
        </View>

        <Text style={styles.date}>{formatDate(new Date())}</Text>
        <Text style={styles.recipient}>Hiring Team{company ? `, ${company}` : ""}</Text>

        <View>
          {paragraphs.map((paragraph, i) => (
            <Text key={i} style={styles.paragraph}>
              {paragraph}
            </Text>
          ))}
        </View>
      </Page>
    </Document>
  );
}
