import { formatDegree, sectionDisplayLabel, type ResumeSection } from "@/types/resumeEditor";

// Markdown résumé export — same reasoning as lib/resumeDocx.ts's own header
// comment: a single plain, ATS-safe layout, not a per-template mirror of
// ResumePDF.tsx's 6 styled templates. Reads the same applications.
// resume_sections structured content the PDF/DOCX exports already read;
// never re-generates or re-derives content. Section-type handling
// deliberately mirrors buildResumeDocx's switch exactly, so the two
// exports never silently drift apart on which sections/fields render.

type ContactInfo = {
  fullName: string;
  email: string | null;
  phone: string | null;
  location: string | null;
};

function sectionMarkdown(section: ResumeSection): string {
  if (!section.visible) return "";

  switch (section.type) {
    case "summary":
      if (!section.content.trim()) return "";
      return `## ${sectionDisplayLabel(section, "Summary")}\n\n${section.content}\n\n`;

    case "skills":
      if (section.items.length === 0) return "";
      return `## ${sectionDisplayLabel(section, "Skills")}\n\n${section.items.join(" • ")}\n\n`;

    case "work_experience":
      if (section.entries.length === 0) return "";
      return (
        `## ${sectionDisplayLabel(section, "Work Experience")}\n\n` +
        section.entries
          .map((entry) => {
            const header = `**${entry.title}, ${entry.company}**  \n*${entry.start_date} – ${entry.is_current ? "Present" : entry.end_date ?? ""}*`;
            const bullets = entry.bullets
              .filter((b) => b.trim())
              .map((bullet) => `- ${bullet}`)
              .join("\n");
            return bullets ? `${header}\n\n${bullets}` : header;
          })
          .join("\n\n") + "\n\n"
      );

    case "education":
      if (section.entries.length === 0) return "";
      return (
        `## ${sectionDisplayLabel(section, "Education")}\n\n` +
        section.entries
          .map((entry) =>
            `- ${formatDegree(entry.degree, entry.field)} — ${entry.institution ?? ""}${entry.graduation_year ? `, ${entry.graduation_year}` : ""}`.trim(),
          )
          .join("\n") + "\n\n"
      );

    case "certifications":
      if (section.entries.length === 0) return "";
      return (
        `## ${sectionDisplayLabel(section, "Certifications")}\n\n` +
        section.entries
          .map((entry) => `- ${entry.name}${entry.issuer ? ` — ${entry.issuer}` : ""}${entry.date ? ` (${entry.date})` : ""}`)
          .join("\n") + "\n\n"
      );

    case "custom":
      if (section.entries.length === 0) return "";
      return (
        `## ${section.title}\n\n` +
        section.entries
          .map((entry) => {
            const header = `**${entry.title}**${entry.subtitle ? `, ${entry.subtitle}` : ""}${entry.date ? `  \n*${entry.date}*` : ""}`;
            const bullets = entry.bullets
              .filter((b) => b.trim())
              .map((bullet) => `- ${bullet}`)
              .join("\n");
            return bullets ? `${header}\n\n${bullets}` : header;
          })
          .join("\n\n") + "\n\n"
      );

    default:
      return "";
  }
}

export function buildResumeMarkdown(sections: ResumeSection[], contact: ContactInfo): string {
  const contactLine = [contact.email, contact.phone, contact.location].filter(Boolean).join(" | ");

  const header = `# ${contact.fullName || "Resume"}\n\n${contactLine ? `${contactLine}\n\n` : ""}`;
  return header + sections.map(sectionMarkdown).join("");
}
