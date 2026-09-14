import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  LevelFormat,
  LineRuleType,
  Packer,
  Paragraph,
  ShadingType,
  TabStopType,
  TextRun,
} from "docx";

import { mapRange, resolveTokens, SPACING_RANGES, type ThemeTokens } from "@/components/documents/ResumePDF";
import { toHref } from "@/lib/utils";
import type { Profile } from "@/types";
import { formatDegree, sectionDisplayLabel, type ResumeSection, type ResumeStyle } from "@/types/resumeEditor";

// DOCX résumé export — the SAME résumé the PDF shows, in Word.
//
// This used to be "deliberately a single plain, ATS-safe layout" built on
// Word's default heading styles, and it read exactly like that: Calibri, stock
// blue headings, no theme, no accent, none of the spacing the user had tuned.
// Direct user report (2026-09-14): "it gives simple text like file without any
// format." The premise was wrong, too — ATS safety comes from STRUCTURE (one
// column, real text, no tables, text boxes or images), not from looking plain.
//
// So this mirrors ResumePDF.tsx from the same inputs: the theme's tokens via
// resolveTokens (accent override included), the font-size knobs, the spacing
// sliders through the same mapRange/SPACING_RANGES, page size, header
// alignment, bullet glyph, skills style and the block template's banner. What
// deliberately does NOT carry over is the two-column layout of "split" and
// "executive": the Word file stays one column in the résumé's own section
// order, because a column layout is the one thing that genuinely confuses
// parsers. Content comes from applications.resume_sections only — never
// re-generated.

type HeaderProfile = Pick<Profile, "full_name" | "email" | "phone" | "location" | "current_title" | "linkedin_url" | "portfolio_url">;

type Ctx = {
  t: ThemeTokens;
  style: ResumeStyle;
  sectionGap: number;
  entryGap: number;
  lineHeight: number;
  centered: boolean;
  headerAlign: (typeof AlignmentType)[keyof typeof AlignmentType];
  /** Text width in twips — where a right-aligned date tab stop belongs. */
  contentWidth: number;
};

const BULLETS_REF = "resume-bullets";

// react-pdf's standard-14 fonts, mapped to what Word actually has: Arial is
// metric-compatible with Helvetica, and Times New Roman with Times-Roman.
function wordFont(t: ThemeTokens): string {
  return t.fontFamily.startsWith("Times") ? "Times New Roman" : "Arial";
}

const color = (hex: string) => hex.replace("#", "").toUpperCase();
// Word measures spacing in twentieths of a point and font size in half-points.
const twip = (pt: number) => Math.round(pt * 20);
const half = (pt: number) => Math.round(pt * 2);

const PAGE = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
} as const;

function alignment(value: "left" | "center" | "right") {
  return value === "center" ? AlignmentType.CENTER : value === "right" ? AlignmentType.RIGHT : AlignmentType.LEFT;
}

function sectionTitle(text: string, ctx: Ctx): Paragraph {
  const { t, style } = ctx;
  const block = style.template === "block";
  return new Paragraph({
    alignment: ctx.centered ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: twip(ctx.sectionGap), after: twip(9) },
    keepNext: true,
    border: {
      bottom: { style: BorderStyle.SINGLE, color: color(block ? t.accent : t.rule), size: block ? 20 : 6, space: 4 },
    },
    // allCaps is display-only: the text stored in the file keeps its real
    // case, which is what a parser extracts.
    children: [
      new TextRun({
        text,
        bold: true,
        allCaps: true,
        color: color(t.accentDark),
        size: half(style.fontSizes.heading),
        characterSpacing: twip(1.4),
      }),
    ],
  });
}

function body(text: string, ctx: Ctx, extra: { after?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: twip(extra.after ?? 0), line: Math.round(240 * ctx.lineHeight), lineRule: LineRuleType.AUTO },
    children: [new TextRun({ text, color: color(ctx.t.textSecondary), size: half(ctx.style.fontSizes.body) })],
  });
}

function bullet(text: string, ctx: Ctx): Paragraph {
  return new Paragraph({
    numbering: { reference: BULLETS_REF, level: 0 },
    spacing: { after: twip(3), line: Math.round(240 * (ctx.lineHeight - 0.1)), lineRule: LineRuleType.AUTO },
    children: [new TextRun({ text, color: color(ctx.t.textSecondary), size: half(ctx.style.fontSizes.body) })],
  });
}

// Title on the left, dates flush right on a tab stop — the PDF's jobHeader row,
// without a table.
function entryHeader(title: string, dates: string, ctx: Ctx, first: boolean): Paragraph {
  const { t, style } = ctx;
  return new Paragraph({
    keepNext: true,
    spacing: { before: first ? 0 : twip(ctx.entryGap), after: twip(1) },
    tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
    children: [
      new TextRun({ text: title, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) }),
      ...(dates
        ? [
            new TextRun({
              text: `\t${dates}`,
              color: color(t.textMuted),
              size: half(style.fontSizes.body - 1),
              allCaps: true,
              characterSpacing: twip(0.3),
            }),
          ]
        : []),
    ],
  });
}

function entrySubline(text: string, ctx: Ctx): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing: { after: twip(4) },
    children: [
      new TextRun({ text, bold: true, color: color(ctx.t.accentDark), size: half(ctx.style.fontSizes.subheading - 1) }),
    ],
  });
}

function detailPair(primary: string, details: string, ctx: Ctx): Paragraph[] {
  const { t, style } = ctx;
  return [
    new Paragraph({
      keepNext: Boolean(details),
      children: [new TextRun({ text: primary, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) })],
    }),
    ...(details
      ? [
          new Paragraph({
            spacing: { before: twip(2), after: twip(ctx.entryGap * 0.6) },
            children: [new TextRun({ text: details, color: color(t.textMuted), size: half(style.fontSizes.body - 1) })],
          }),
        ]
      : []),
  ];
}

function skillsParagraphs(items: string[], ctx: Ctx): Paragraph[] {
  const { t, style } = ctx;
  const size = half(style.fontSizes.body - 1);

  if (t.skillStyle === "chip") {
    // Each skill carries a thin accent border — Word draws it as a box around
    // the run, the same chip the PDF shows — while staying plain text.
    const runs: TextRun[] = [];
    items.forEach((skill, i) => {
      if (i > 0) runs.push(new TextRun({ text: "   ", size }));
      runs.push(
        new TextRun({
          text: ` ${skill} `,
          color: color(t.accentDark),
          size,
          border: { style: BorderStyle.SINGLE, color: color(t.accent), size: 6, space: 1 },
        }),
      );
    });
    return [new Paragraph({ spacing: { line: 360, lineRule: LineRuleType.AUTO }, children: runs })];
  }

  // Plain themes lay skills out in the chosen number of columns with tab stops
  // rather than a table.
  const columns = style.skillsColumns;
  const columnWidth = Math.floor(ctx.contentWidth / columns);
  const rows: Paragraph[] = [];
  for (let i = 0; i < items.length; i += columns) {
    const row = items.slice(i, i + columns);
    rows.push(
      new Paragraph({
        tabStops: Array.from({ length: columns - 1 }, (_, c) => ({ type: TabStopType.LEFT, position: columnWidth * (c + 1) })),
        spacing: { after: twip(3) },
        children: [
          new TextRun({ text: row.join("\t"), color: color(t.textSecondary), size: half(style.fontSizes.body) }),
        ],
      }),
    );
  }
  return rows;
}

function sectionParagraphs(section: ResumeSection, ctx: Ctx): Paragraph[] {
  if (!section.visible) return [];

  switch (section.type) {
    case "summary":
      if (!section.content.trim()) return [];
      return [sectionTitle(sectionDisplayLabel(section, "Professional Summary"), ctx), body(section.content, ctx)];

    case "skills":
      if (section.items.length === 0) return [];
      return [sectionTitle(sectionDisplayLabel(section, "Skills"), ctx), ...skillsParagraphs(section.items, ctx)];

    case "work_experience":
      if (section.entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Work Experience"), ctx),
        ...section.entries.flatMap((entry, i) => [
          entryHeader(entry.title, `${entry.start_date} – ${entry.is_current ? "Present" : (entry.end_date ?? "")}`, ctx, i === 0),
          ...(entry.company ? [entrySubline(entry.company, ctx)] : []),
          ...entry.bullets.filter((b) => b.trim()).map((b) => bullet(b, ctx)),
        ]),
      ];

    case "education": {
      const entries = section.entries.filter((e) => e.degree);
      if (entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Education"), ctx),
        ...entries.flatMap((e) =>
          detailPair(
            formatDegree(e.degree, e.field),
            [e.institution, e.graduation_year].filter(Boolean).join("   •   "),
            ctx,
          ),
        ),
      ];
    }

    case "certifications": {
      const entries = section.entries.filter((e) => e.name);
      if (entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Certifications"), ctx),
        ...entries.flatMap((e) => detailPair(e.name, [e.issuer, e.date].filter(Boolean).join("   •   "), ctx)),
      ];
    }

    case "custom": {
      const entries = section.entries.filter((e) => e.title || e.subtitle || e.bullets.some(Boolean));
      if (entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Custom Section"), ctx),
        ...entries.flatMap((entry, i) => [
          entryHeader(entry.title, entry.date, ctx, i === 0),
          ...(entry.subtitle ? [entrySubline(entry.subtitle, ctx)] : []),
          ...entry.bullets.filter((b) => b.trim()).map((b) => bullet(b, ctx)),
        ]),
      ];
    }

    default:
      return [];
  }
}

// Name, "current title | location", then contact details — the PDF header.
// The "block" template's solid banner is paragraph shading, which Word runs
// together across consecutive paragraphs into one filled band.
function headerParagraphs(profile: HeaderProfile, ctx: Ctx): Paragraph[] {
  const { t, style } = ctx;
  const block = style.template === "block";
  const banner = block ? { type: ShadingType.CLEAR, color: "auto", fill: color(t.accentDark) } : undefined;
  const nameColor = block ? "FFFFFF" : color(t.ink);
  const subColor = block ? "FFFFFF" : color(t.accentDark);
  const contactColor = block ? "FFFFFF" : color(t.textMuted);
  const dividerColor = block ? "FFFFFF" : color(t.rule);
  const contactSize = half(style.fontSizes.body - 1);

  const subtitle = [profile.current_title, profile.location].filter(Boolean).join("   |   ");

  const contactChildren: (TextRun | ExternalHyperlink)[] = [];
  const plain = [profile.email, profile.phone].filter((v): v is string => Boolean(v));
  const links = [profile.linkedin_url, profile.portfolio_url].filter((v): v is string => Boolean(v));
  [...plain.map((text) => ({ text, href: null as string | null })), ...links.map((text) => ({ text, href: toHref(text) }))].forEach(
    (part, i) => {
      if (i > 0) contactChildren.push(new TextRun({ text: "  •  ", color: dividerColor, size: contactSize }));
      const run = new TextRun({ text: part.text, color: contactColor, size: contactSize });
      contactChildren.push(part.href ? new ExternalHyperlink({ link: part.href, children: [run] }) : run);
    },
  );

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: ctx.headerAlign,
      shading: banner,
      spacing: block ? { before: twip(4) } : undefined,
      border:
        t.showHeaderRule && !block
          ? { bottom: { style: BorderStyle.SINGLE, color: color(t.accent), size: 12, space: 6 } }
          : undefined,
      children: [
        new TextRun({
          text: profile.full_name || "Résumé",
          bold: true,
          color: nameColor,
          size: half(style.fontSizes.name),
          characterSpacing: twip(t.nameLetterSpacing),
        }),
      ],
    }),
  ];

  if (subtitle) {
    paragraphs.push(
      new Paragraph({
        alignment: ctx.headerAlign,
        shading: banner,
        spacing: { before: twip(block ? 4 : 8) },
        children: [
          new TextRun({ text: subtitle, bold: true, color: subColor, size: half(style.fontSizes.subheading + 1.5) }),
        ],
      }),
    );
  }

  if (contactChildren.length > 0) {
    paragraphs.push(
      new Paragraph({
        alignment: ctx.headerAlign,
        shading: banner,
        spacing: { before: twip(5), after: block ? twip(8) : 0 },
        children: contactChildren,
      }),
    );
  }

  // Breathing room below the banner or header before the first section.
  paragraphs.push(new Paragraph({ spacing: { after: twip(block ? 8 : 4) }, children: [] }));
  return paragraphs;
}

export async function buildResumeDocx(sections: ResumeSection[], style: ResumeStyle, profile: HeaderProfile): Promise<Buffer> {
  const t = resolveTokens(style);
  const page = PAGE[style.pageSize] ?? PAGE.letter;
  const margin = twip(mapRange(style.spacing.margins, ...SPACING_RANGES.margins));
  const centered = style.template === "centered" || style.template === "block";

  const ctx: Ctx = {
    t,
    style,
    sectionGap: mapRange(style.spacing.section, ...SPACING_RANGES.section),
    entryGap: mapRange(style.spacing.entry, ...SPACING_RANGES.entry),
    lineHeight: mapRange(style.spacing.line, ...SPACING_RANGES.line),
    centered,
    headerAlign: alignment(centered ? "center" : style.headerAlignment),
    contentWidth: page.width - margin * 2,
  };

  const font = wordFont(t);
  const bodySize = style.fontSizes.body;

  const doc = new Document({
    creator: "Sortie",
    title: profile.full_name ? `${profile.full_name} — Résumé` : "Résumé",
    styles: {
      default: {
        document: {
          run: { font, size: half(bodySize), color: color(t.ink) },
          paragraph: { spacing: { after: 0 } },
        },
      },
    },
    numbering: {
      config: [
        {
          reference: BULLETS_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.BULLET,
              text: style.bulletStyle,
              alignment: AlignmentType.LEFT,
              style: {
                run: { color: color(t.accent), font },
                paragraph: { indent: { left: twip(bodySize * 1.6), hanging: twip(bodySize * 1.1) } },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: page.width, height: page.height },
            margin: { top: margin, bottom: margin, left: margin, right: margin },
          },
        },
        children: [...headerParagraphs(profile, ctx), ...sections.flatMap((s) => sectionParagraphs(s, ctx))],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
