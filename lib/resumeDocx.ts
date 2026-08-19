import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";

import { sectionDisplayLabel, type ResumeSection } from "@/types/resumeEditor";

// DOCX resume export (build-plan.md §C, Phase 16) — deliberately a single
// plain, ATS-safe layout, not a per-template mirror of ResumePDF.tsx's 6
// styled templates. The whole point of a DOCX export is maximum ATS
// compatibility; replicating multi-column/styled layouts here would work
// against that. Reads the same applications.resume_sections structured
// content the PDF renders from — never re-generates or re-derives content.

type ContactInfo = {
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
};

const HEADING_SPACING = { before: 240, after: 80 };

function sectionParagraphs(section: ResumeSection): Paragraph[] {
  if (!section.visible) return [];

  switch (section.type) {
    case "summary":
      if (!section.content.trim()) return [];
      return [
        new Paragraph({ text: sectionDisplayLabel(section, "Summary"), heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        new Paragraph({ text: section.content, spacing: { after: 120 } }),
      ];

    case "skills":
      if (section.items.length === 0) return [];
      return [
        new Paragraph({ text: sectionDisplayLabel(section, "Skills"), heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        new Paragraph({ text: section.items.join(" • "), spacing: { after: 120 } }),
      ];

    case "work_experience":
      if (section.entries.length === 0) return [];
      return [
        new Paragraph({ text: sectionDisplayLabel(section, "Work Experience"), heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        ...section.entries.flatMap((entry) => [
          new Paragraph({
            children: [
              new TextRun({ text: `${entry.title}, ${entry.company}`, bold: true }),
              new TextRun({ text: `   ${entry.start_date} – ${entry.is_current ? "Present" : entry.end_date ?? ""}`, italics: true }),
            ],
            spacing: { before: 100 },
          }),
          ...entry.bullets.filter((b) => b.trim()).map((bullet) => new Paragraph({ text: bullet, bullet: { level: 0 } })),
        ]),
      ];

    case "education":
      if (section.entries.length === 0) return [];
      return [
        new Paragraph({ text: sectionDisplayLabel(section, "Education"), heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        ...section.entries.map(
          (entry) =>
            new Paragraph({
              text: `${entry.degree ?? ""} ${entry.field ? `in ${entry.field}` : ""} — ${entry.institution ?? ""}${entry.graduation_year ? `, ${entry.graduation_year}` : ""}`.trim(),
            }),
        ),
      ];

    case "certifications":
      if (section.entries.length === 0) return [];
      return [
        new Paragraph({ text: sectionDisplayLabel(section, "Certifications"), heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        ...section.entries.map(
          (entry) => new Paragraph({ text: `${entry.name}${entry.issuer ? ` — ${entry.issuer}` : ""}${entry.date ? ` (${entry.date})` : ""}` }),
        ),
      ];

    case "custom":
      if (section.entries.length === 0) return [];
      return [
        new Paragraph({ text: section.title, heading: HeadingLevel.HEADING_2, spacing: HEADING_SPACING }),
        ...section.entries.flatMap((entry) => [
          new Paragraph({
            children: [
              new TextRun({ text: entry.title, bold: true }),
              entry.subtitle ? new TextRun({ text: `, ${entry.subtitle}` }) : new TextRun({ text: "" }),
              entry.date ? new TextRun({ text: `   ${entry.date}`, italics: true }) : new TextRun({ text: "" }),
            ],
            spacing: { before: 100 },
          }),
          ...entry.bullets.filter((b) => b.trim()).map((bullet) => new Paragraph({ text: bullet, bullet: { level: 0 } })),
        ]),
      ];

    default:
      return [];
  }
}

export async function buildResumeDocx(sections: ResumeSection[], contact: ContactInfo): Promise<Buffer> {
  const contactLine = [contact.email, contact.phone, contact.location].filter(Boolean).join(" | ");

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: contact.fullName || "Resume", heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
          ...(contactLine ? [new Paragraph({ text: contactLine, alignment: AlignmentType.CENTER, spacing: { after: 200 } })] : []),
          ...sections.flatMap(sectionParagraphs),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
