import React from "react";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";

import { formatDate } from "@/lib/utils";
import type { Profile } from "@/types";

type Props = {
  profile: Profile;
  company: string | null;
  letterBody: string;
};

const styles = StyleSheet.create({
  page: {
    padding: 48,
    fontFamily: "Helvetica",
    fontSize: 10.5,
    color: "#1a1a1a",
  },
  name: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#111111",
  },
  contact: {
    fontSize: 9,
    color: "#666666",
    marginTop: 3,
  },
  date: {
    fontSize: 10,
    color: "#444444",
    marginTop: 28,
  },
  recipient: {
    fontSize: 10,
    color: "#444444",
    marginTop: 4,
  },
  paragraph: {
    fontSize: 10.5,
    color: "#333333",
    marginTop: 14,
    lineHeight: 1.6,
  },
});

export function CoverLetterPDF({ profile, company, letterBody }: Props) {
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
