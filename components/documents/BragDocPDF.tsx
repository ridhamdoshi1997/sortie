import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import { formatDate } from "@/lib/utils";
import { mapRange, resolveTokens, SPACING_RANGES, type ThemeTokens } from "@/components/documents/ResumePDF";
import { buildDefaultStyle } from "@/lib/resumeSections";
import type { BragDocResult } from "@/lib/bragDoc";

type Props = {
  fullName: string | null;
  currentTitle: string | null;
  startDate: string;
  endDate: string;
  bragDoc: BragDocResult;
};

// §Q4 Brag Doc — reuses ResumePDF's own token/spacing infra (resolveTokens,
// mapRange, SPACING_RANGES) rather than a new PDF pipeline, same pattern
// CoverLetterPDF.tsx already established. A brag doc has no template/theme
// picker of its own in v1 — it's a single fixed "modern" layout, since this
// is an internal self-review draft, not a document tailored per employer.
function createStyles(t: ThemeTokens) {
  const style = buildDefaultStyle(null);
  const margin = mapRange(style.spacing.margins, ...SPACING_RANGES.margins);
  const lineHeight = mapRange(style.spacing.line, ...SPACING_RANGES.line);
  return StyleSheet.create({
    page: {
      padding: margin,
      fontFamily: t.fontFamily,
      fontSize: 9.5,
      color: t.ink,
    },
    name: {
      fontSize: 22,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    subtitle: {
      fontSize: 10.5,
      color: t.accentDark,
      fontFamily: t.fontFamilyBold,
      marginTop: 4,
    },
    period: {
      fontSize: 9,
      color: t.textMuted,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 10.5,
      fontFamily: t.fontFamilyBold,
      color: t.accentDark,
      letterSpacing: 1,
      textTransform: "uppercase",
      marginTop: 20,
      marginBottom: 6,
      borderBottomWidth: 1,
      borderBottomColor: t.rule,
      paddingBottom: 4,
    },
    summary: {
      fontSize: 9.5,
      color: t.textSecondary,
      lineHeight,
    },
    highlight: {
      marginTop: 10,
    },
    highlightTitle: {
      fontSize: 9.5,
      fontFamily: t.fontFamilyBold,
      color: t.ink,
    },
    highlightImpact: {
      fontSize: 9.5,
      color: t.textSecondary,
      lineHeight,
      marginTop: 2,
    },
    skillsLine: {
      fontSize: 9.5,
      color: t.textSecondary,
      lineHeight,
    },
  });
}

export function BragDocPDF({ fullName, currentTitle, startDate, endDate, bragDoc }: Props) {
  const tokens = resolveTokens(buildDefaultStyle(null));
  const styles = createStyles(tokens);
  const subtitleParts = ["Accomplishment Summary", currentTitle].filter(Boolean);

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.name}>{fullName ?? ""}</Text>
        <Text style={styles.subtitle}>{subtitleParts.join(" — ")}</Text>
        <Text style={styles.period}>
          {formatDate(startDate)} – {formatDate(endDate)}
        </Text>

        <Text style={styles.sectionTitle}>Summary</Text>
        <Text style={styles.summary}>{bragDoc.summary}</Text>

        {bragDoc.highlights.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Key Achievements</Text>
            {bragDoc.highlights.map((h, i) => (
              <View key={i} style={styles.highlight}>
                <Text style={styles.highlightTitle}>{h.title}</Text>
                <Text style={styles.highlightImpact}>{h.impact}</Text>
              </View>
            ))}
          </>
        )}

        {bragDoc.skillsShowcased.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Skills Demonstrated</Text>
            <Text style={styles.skillsLine}>{bragDoc.skillsShowcased.join("  •  ")}</Text>
          </>
        )}
      </Page>
    </Document>
  );
}
