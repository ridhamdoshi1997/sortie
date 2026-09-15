import { allSkills, dateRange, educationYears, highlightItems } from "@/lib/resumeLayout";
import { formatDegree, sectionDisplayLabel, type ResumeSection } from "@/types/resumeEditor";

// Markdown résumé export — a single plain layout, not a per-template mirror
// of ResumePDF.tsx's styled templates. Reads the same saved sections the
// PDF/DOCX exports read; never re-generates or re-derives content. Section
// handling follows buildResumeDocx's switch, so the exports don't drift apart
// on which sections and fields render. **Bold** markup passes straight
// through, since Markdown already means the same thing by it.

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

    case "skills": {
      if (allSkills(section).length === 0) return "";
      const groups = (section.groups ?? []).filter((g) => g.label.trim() && g.items.length > 0);
      const lines = [
        ...groups.map((g) => `**${g.label.trim()}:** ${g.items.join(", ")}`),
        ...(section.items.length > 0 ? [section.items.join(" • ")] : []),
      ];
      return `## ${sectionDisplayLabel(section, "Skills")}\n\n${lines.join("  \n")}\n\n`;
    }

    case "work_experience":
      if (section.entries.length === 0) return "";
      return (
        `## ${sectionDisplayLabel(section, "Work Experience")}\n\n` +
        section.entries
          .map((entry) => {
            const company = [entry.company, entry.location].filter(Boolean).join(", ");
            const header = `**${entry.title}, ${company}**  \n*${dateRange(entry.start_date, entry.end_date, entry.is_current)}*`;
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
          .map((entry) => {
            const where = [entry.institution, entry.location].filter(Boolean).join(", ");
            const years = educationYears(entry);
            return `- ${formatDegree(entry.degree, entry.field)} — ${where}${years ? `, ${years}` : ""}`.trim();
          })
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
            const header = [
              `**${entry.title}**${entry.subtitle ? `, ${entry.subtitle}` : ""}`,
              entry.date ? `*${entry.date}*` : "",
              entry.details ? `*${entry.details}*` : "",
              entry.link ?? "",
            ]
              .filter(Boolean)
              .join("  \n");
            const bullets = entry.bullets
              .filter((b) => b.trim())
              .map((bullet) => `- ${bullet}`)
              .join("\n");
            return bullets ? `${header}\n\n${bullets}` : header;
          })
          .join("\n\n") + "\n\n"
      );

    // Highlights print in the header.
    default:
      return "";
  }
}

export function buildResumeMarkdown(sections: ResumeSection[], contact: ContactInfo): string {
  const contactLine = [contact.email, contact.phone, contact.location].filter(Boolean).join(" | ");
  const highlights = highlightItems(sections);

  const header =
    `# ${contact.fullName || "Resume"}\n\n` +
    (contactLine ? `${contactLine}\n\n` : "") +
    (highlights.length > 0 ? `**${highlights.join(" • ")}**\n\n` : "");
  return header + sections.map(sectionMarkdown).join("");
}
