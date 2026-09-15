import type { ResumeFontKey } from "@/types/resumeEditor";

// Résumé fonts (Phase 1, 2026-09-15).
//
// A PDF can only use the three families built into the format without
// shipping font files, and the popular résumé faces — Calibri, Cambria,
// Georgia — are licensed and cannot be redistributed. So each option pairs:
//   * for the PDF: a built-in family, or a free SIL-OFL font drawn to the SAME
//     letter widths (Carlito = Calibri, Caladea = Cambria, Gelasio = Georgia),
//     so line breaks and page fit match what the user sees in Word;
//   * for the Word file: the real font name, which Word supplies itself.
//
// The font files live in public/fonts (regular, bold, italic, bold-italic) and
// are registered with react-pdf in components/documents/resumePdfFonts.ts.
// This module has no react-pdf import so the DOCX builder and the Style tab
// can read it cheaply.
//
// Deliberately short and professional: an unusual font is the one font choice
// that can actually hurt how an ATS reads text.

export type PdfFontStyle = { fontFamily: string; fontWeight?: number; fontStyle?: "normal" | "italic" };

export type ResumeFontSpec = {
  key: ResumeFontKey;
  label: string;
  category: "Sans serif" | "Serif";
  /** The font name written into the Word file. */
  docx: string;
  /** Built-in PDF family names per style, or an embedded family registered from public/fonts. */
  pdf:
    | { builtIn: true; regular: string; bold: string; italic: string; boldItalic: string }
    | { builtIn: false; family: string; filePrefix: string };
};

export const RESUME_FONTS: Record<ResumeFontKey, ResumeFontSpec> = {
  calibri: {
    key: "calibri",
    label: "Calibri",
    category: "Sans serif",
    docx: "Calibri",
    pdf: { builtIn: false, family: "Carlito", filePrefix: "carlito" },
  },
  arial: {
    key: "arial",
    label: "Arial",
    category: "Sans serif",
    docx: "Arial",
    pdf: { builtIn: true, regular: "Helvetica", bold: "Helvetica-Bold", italic: "Helvetica-Oblique", boldItalic: "Helvetica-BoldOblique" },
  },
  cambria: {
    key: "cambria",
    label: "Cambria",
    category: "Serif",
    docx: "Cambria",
    pdf: { builtIn: false, family: "Caladea", filePrefix: "caladea" },
  },
  georgia: {
    key: "georgia",
    label: "Georgia",
    category: "Serif",
    docx: "Georgia",
    pdf: { builtIn: false, family: "Gelasio", filePrefix: "gelasio" },
  },
  times: {
    key: "times",
    label: "Times New Roman",
    category: "Serif",
    docx: "Times New Roman",
    pdf: { builtIn: true, regular: "Times-Roman", bold: "Times-Bold", italic: "Times-Italic", boldItalic: "Times-BoldItalic" },
  },
  garamond: {
    key: "garamond",
    label: "Garamond",
    category: "Serif",
    docx: "Garamond",
    pdf: { builtIn: false, family: "EB Garamond", filePrefix: "eb-garamond" },
  },
};

export const RESUME_FONT_ORDER: ResumeFontKey[] = ["calibri", "arial", "cambria", "georgia", "times", "garamond"];

/** A theme's original family, for styles saved before fonts were selectable. */
export function fontKeyForThemeFamily(themeFontFamily: string): ResumeFontKey {
  return themeFontFamily.startsWith("Times") ? "times" : "arial";
}

/** react-pdf style for one weight/style of a font. */
export function pdfFontStyle(spec: ResumeFontSpec, bold: boolean, italic: boolean): PdfFontStyle {
  if (spec.pdf.builtIn) {
    const name = bold && italic ? spec.pdf.boldItalic : bold ? spec.pdf.bold : italic ? spec.pdf.italic : spec.pdf.regular;
    return { fontFamily: name };
  }
  return { fontFamily: spec.pdf.family, fontWeight: bold ? 700 : 400, fontStyle: italic ? "italic" : "normal" };
}
