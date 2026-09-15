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

import { resolveTokens, spacingPt, type ResolvedTokens } from "@/components/documents/ResumePDF";
import { RESUME_FONTS } from "@/lib/resumeFonts";
import {
  allSkills,
  certificationText,
  dateRange,
  educationYears,
  headerContactParts,
  headerSubtitle,
  highlightItems,
  parseRich,
  resolveSkillsDisplay,
  usesCompactHeader,
} from "@/lib/resumeLayout";
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
// So this mirrors ResumePDF.tsx from the same inputs: resolveTokens (theme,
// template palette, accent override, font), the font-size knobs, spacingPt,
// page size, header alignment, bullet glyph, skills layout, role header order
// and the block template's banner. Layout decisions come from
// lib/resumeLayout.ts, which the PDF uses too. The font is written as its real
// Word name (Calibri, Cambria…); the PDF uses a metric-identical free font.
// What deliberately does NOT carry over is the two-column layout of "split"
// and "executive": the Word file stays one column in the résumé's own section
// order. Content comes from the saved sections only — never re-generated.

type HeaderProfile = Pick<Profile, "full_name" | "email" | "phone" | "location" | "current_title" | "linkedin_url" | "portfolio_url">;

type Ctx = {
  t: ResolvedTokens;
  style: ResumeStyle;
  sectionGap: number;
  entryGap: number;
  lineHeight: number;
  centered: boolean;
  compact: boolean;
  isPro: boolean;
  isEarly: boolean;
  headerAlign: (typeof AlignmentType)[keyof typeof AlignmentType];
  /** Text width in twips — where a right-aligned date tab stop belongs. */
  contentWidth: number;
  contactSize: number;
  datesSize: number;
};

const BULLETS_REF = "resume-bullets";
const PLAIN_BULLETS_REF = "resume-plain-bullets";

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

type RunOptions = { color: string; size: number; bold?: boolean; italics?: boolean; underline?: boolean };

// Text with **bold** runs, as in the PDF.
function richRuns(text: string, opts: RunOptions, strongColor: string): TextRun[] {
  return parseRich(text).map(
    (run) =>
      new TextRun({
        text: run.text,
        size: opts.size,
        italics: opts.italics,
        bold: run.bold || opts.bold,
        color: run.bold ? strongColor : opts.color,
      }),
  );
}

function sectionTitle(text: string, ctx: Ctx): Paragraph {
  const { t, style, compact, isPro } = ctx;
  const block = style.template === "block";
  return new Paragraph({
    alignment: ctx.centered && !compact ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: twip(ctx.sectionGap), after: twip(compact ? (isPro ? 4 : 2) : 9) },
    keepNext: true,
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        color: color(block ? t.accent : t.rule),
        size: compact ? 6 : block ? 20 : 6,
        space: compact ? 2 : 4,
      },
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
        characterSpacing: twip(compact ? (isPro ? 1 : 0.4) : 1.4),
      }),
    ],
  });
}

function lineSpacing(ctx: Ctx, tighter = false) {
  const lh = tighter ? Math.max(1, ctx.lineHeight - 0.1) : ctx.lineHeight;
  return { line: Math.round(240 * lh), lineRule: LineRuleType.AUTO };
}

function body(text: string, ctx: Ctx): Paragraph {
  return new Paragraph({
    spacing: { after: 0, ...lineSpacing(ctx) },
    children: richRuns(text, { color: color(ctx.t.textSecondary), size: half(ctx.style.fontSizes.body) }, color(ctx.t.ink)),
  });
}

function bullet(text: string, ctx: Ctx, plain = false): Paragraph {
  const after = ctx.compact ? (ctx.isPro ? 2.75 : 1.5) : 3;
  return new Paragraph({
    numbering: { reference: plain ? PLAIN_BULLETS_REF : BULLETS_REF, level: 0 },
    spacing: { after: twip(after), ...lineSpacing(ctx, true) },
    children: richRuns(text, { color: color(ctx.t.textSecondary), size: half(ctx.style.fontSizes.body) }, color(ctx.t.ink)),
  });
}

// Left text … right-aligned text on a tab stop — the PDF's header row, without a table.
function rightTabParagraph(left: TextRun[], right: TextRun | null, ctx: Ctx, spacing: { before?: number; after?: number }): Paragraph {
  return new Paragraph({
    keepNext: true,
    spacing,
    tabStops: [{ type: TabStopType.RIGHT, position: ctx.contentWidth }],
    children: right ? [...left, new TextRun({ text: "\t" }), right] : left,
  });
}

function datesRun(text: string, ctx: Ctx): TextRun {
  const { t, compact, isPro } = ctx;
  return new TextRun({
    text,
    color: color(t.textMuted),
    size: half(ctx.datesSize),
    italics: compact && isPro,
    bold: compact && !isPro,
    allCaps: !compact,
    characterSpacing: compact ? undefined : twip(0.3),
  });
}

function workParagraphs(entry: Extract<ResumeSection, { type: "work_experience" }>["entries"][number], ctx: Ctx, first: boolean): Paragraph[] {
  const { t, style } = ctx;
  const before = first ? 0 : twip(ctx.entryGap);
  const dates = dateRange(entry.start_date, entry.end_date, entry.is_current);
  const bullets = entry.bullets.filter((b) => b.trim()).map((b) => bullet(b, ctx));

  if (style.entryHeader === "company_first") {
    return [
      rightTabParagraph(
        [
          new TextRun({ text: entry.company, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) }),
          ...(entry.location
            ? [new TextRun({ text: `  |  ${entry.location}`, color: color(t.textMuted), size: half(style.fontSizes.subheading) })]
            : []),
        ],
        dates ? datesRun(dates, ctx) : null,
        ctx,
        { before, after: twip(1) },
      ),
      ...(entry.title
        ? [
            new Paragraph({
              keepNext: true,
              spacing: { after: twip(2.25) },
              children: [new TextRun({ text: entry.title, italics: true, color: color(t.accentDark), size: half(style.fontSizes.body) })],
            }),
          ]
        : []),
      ...bullets,
    ];
  }

  const companyText = [entry.company, entry.location].filter(Boolean).join(", ");
  return [
    rightTabParagraph(
      [new TextRun({ text: entry.title, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) })],
      dates ? datesRun(dates, ctx) : null,
      ctx,
      { before, after: twip(1) },
    ),
    ...(companyText
      ? [
          new Paragraph({
            keepNext: true,
            spacing: { after: twip(ctx.isEarly ? 1.8 : 4) },
            children: [
              ctx.isEarly
                ? new TextRun({ text: companyText, italics: true, color: color(t.textMuted), size: half(style.fontSizes.body) })
                : new TextRun({ text: companyText, bold: true, color: color(t.accentDark), size: half(style.fontSizes.subheading - 1) }),
            ],
          }),
        ]
      : []),
    ...bullets,
  ];
}

function skillsParagraphs(section: Extract<ResumeSection, { type: "skills" }>, ctx: Ctx): Paragraph[] {
  const { t, style } = ctx;
  const skills = allSkills(section);
  const display = resolveSkillsDisplay(style, t.skillStyle);
  const bodySize = half(style.fontSizes.body);

  if (display === "grouped") {
    const groups = (section.groups ?? []).filter((g) => g.label.trim() && g.items.some((i) => i.trim()));
    const ungrouped = section.items.map((i) => i.trim()).filter(Boolean);
    const lines = groups.map(
      (group) =>
        new Paragraph({
          spacing: { after: twip(3.5), ...lineSpacing(ctx) },
          children: [
            new TextRun({ text: `${group.label.trim()}:  `, bold: true, color: color(t.ink), size: bodySize }),
            new TextRun({ text: group.items.map((s) => s.trim()).filter(Boolean).join(", "), color: color(t.textSecondary), size: bodySize }),
          ],
        }),
    );
    if (ungrouped.length > 0) {
      lines.push(
        new Paragraph({
          spacing: { after: twip(3.5), ...lineSpacing(ctx) },
          children: [new TextRun({ text: ungrouped.join(", "), color: color(t.textSecondary), size: bodySize })],
        }),
      );
    }
    return lines;
  }

  if (display === "chips") {
    // Each skill carries a thin accent border — Word draws it as a box around
    // the run, the same chip the PDF shows — while staying plain text.
    const size = half(style.fontSizes.body - 1);
    const runs: TextRun[] = [];
    skills.forEach((skill, i) => {
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

  // Grid and bulleted grid: the chosen number of columns on tab stops, not a table.
  const columns = style.skillsColumns;
  const columnWidth = Math.floor(ctx.contentWidth / columns);
  const prefix = display === "bulleted" ? "•  " : "";
  const rows: Paragraph[] = [];
  for (let i = 0; i < skills.length; i += columns) {
    const row = skills.slice(i, i + columns).map((s) => `${prefix}${s}`);
    rows.push(
      new Paragraph({
        tabStops: Array.from({ length: columns - 1 }, (_, c) => ({ type: TabStopType.LEFT, position: columnWidth * (c + 1) })),
        spacing: { after: twip(display === "bulleted" ? 1.25 : 3), ...lineSpacing(ctx) },
        children: [new TextRun({ text: row.join("\t"), color: color(t.textSecondary), size: bodySize })],
      }),
    );
  }
  return rows;
}

function sectionParagraphs(section: ResumeSection, ctx: Ctx): Paragraph[] {
  if (!section.visible) return [];
  const { t, style, isPro, isEarly } = ctx;

  switch (section.type) {
    case "highlights":
      // Printed in the header.
      return [];

    case "summary":
      if (!section.content.trim()) return [];
      return [sectionTitle(sectionDisplayLabel(section, "Professional Summary"), ctx), body(section.content, ctx)];

    case "skills":
      if (allSkills(section).length === 0) return [];
      return [sectionTitle(sectionDisplayLabel(section, "Skills"), ctx), ...skillsParagraphs(section, ctx)];

    case "work_experience":
      if (section.entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Work Experience"), ctx),
        ...section.entries.flatMap((entry, i) => workParagraphs(entry, ctx, i === 0)),
      ];

    case "education": {
      const entries = section.entries.filter((e) => e.degree);
      if (entries.length === 0) return [];
      const title = sectionTitle(sectionDisplayLabel(section, "Education"), ctx);

      if (isEarly) {
        return [
          title,
          ...entries.map((e) => {
            const years = educationYears(e);
            const line = [formatDegree(e.degree, e.field), e.institution, e.location].filter(Boolean).join(", ");
            return bullet(years ? `${line} (${years})` : line, ctx, true);
          }),
        ];
      }

      return [
        title,
        ...entries.flatMap((e) => {
          const years = educationYears(e);
          const meta = [e.institution, e.location].filter(Boolean).join(", ");
          const degree = new Paragraph({
            keepNext: true,
            children: [new TextRun({ text: formatDegree(e.degree, e.field), bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) })],
          });
          if (isPro) {
            return [
              degree,
              rightTabParagraph(
                [new TextRun({ text: meta, color: color(t.textMuted), size: half(style.fontSizes.body) })],
                years ? new TextRun({ text: years, bold: true, color: color(t.textMuted), size: half(ctx.datesSize) }) : null,
                ctx,
                { before: twip(1), after: twip(ctx.entryGap * 0.6) },
              ),
            ];
          }
          const details = [meta, years].filter(Boolean).join("   •   ");
          return [
            degree,
            ...(details
              ? [
                  new Paragraph({
                    spacing: { before: twip(2), after: twip(ctx.entryGap * 0.6) },
                    children: [new TextRun({ text: details, color: color(t.textMuted), size: half(style.fontSizes.body - 1) })],
                  }),
                ]
              : []),
          ];
        }),
      ];
    }

    case "certifications": {
      const entries = section.entries.filter((e) => e.name);
      if (entries.length === 0) return [];
      const title = sectionTitle(sectionDisplayLabel(section, "Certifications"), ctx);

      if (style.certificationsDisplay === "inline") {
        return [
          title,
          new Paragraph({
            spacing: lineSpacing(ctx),
            children: [
              new TextRun({ text: entries.map(certificationText).join("   |   "), color: color(t.textSecondary), size: half(style.fontSizes.body - 0.5) }),
            ],
          }),
        ];
      }
      if (isEarly) return [title, ...entries.map((e) => bullet(certificationText(e), ctx, true))];

      return [
        title,
        ...entries.flatMap((e) => {
          const details = [e.issuer, e.date].filter(Boolean).join("   •   ");
          return [
            new Paragraph({
              keepNext: Boolean(details),
              children: [new TextRun({ text: e.name, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) })],
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
        }),
      ];
    }

    case "custom": {
      const entries = section.entries.filter((e) => e.title || e.subtitle || e.bullets.some(Boolean));
      if (entries.length === 0) return [];
      return [
        sectionTitle(sectionDisplayLabel(section, "Custom Section"), ctx),
        ...entries.flatMap((entry, i) => [
          rightTabParagraph(
            [new TextRun({ text: entry.title, bold: true, color: color(t.ink), size: half(style.fontSizes.subheading) })],
            entry.date ? datesRun(entry.date, ctx) : null,
            ctx,
            { before: i === 0 ? 0 : twip(ctx.entryGap), after: twip(1) },
          ),
          ...(entry.subtitle
            ? [
                new Paragraph({
                  keepNext: true,
                  spacing: { after: twip(2) },
                  children: [
                    isPro
                      ? new TextRun({ text: entry.subtitle, italics: true, color: color(t.accentDark), size: half(style.fontSizes.body) })
                      : new TextRun({ text: entry.subtitle, bold: true, color: color(t.accentDark), size: half(style.fontSizes.subheading - 1) }),
                  ],
                }),
              ]
            : []),
          ...(entry.details
            ? [
                new Paragraph({
                  keepNext: true,
                  spacing: { after: twip(1.5) },
                  children: richRuns(entry.details, { color: color(t.textMuted), size: half(style.fontSizes.body - 0.5), italics: true }, color(t.ink)),
                }),
              ]
            : []),
          ...(entry.link
            ? [
                new Paragraph({
                  keepNext: true,
                  spacing: { after: twip(2) },
                  children: [new TextRun({ text: entry.link, color: color(t.textMuted), size: half(style.fontSizes.body - 0.5) })],
                }),
              ]
            : []),
          ...entry.bullets.filter((b) => b.trim()).map((b) => bullet(b, ctx)),
        ]),
      ];
    }

    default:
      return [];
  }
}

// Name, subtitle, contact line and highlights — the PDF header. The "block"
// template's solid banner is paragraph shading, which Word runs together
// across consecutive paragraphs into one filled band; Professional draws its
// rule under the contact line.
function headerParagraphs(profile: HeaderProfile, sections: ResumeSection[], ctx: Ctx): Paragraph[] {
  const { t, style, compact, isPro, isEarly } = ctx;
  const block = style.template === "block";
  const banner = block ? { type: ShadingType.CLEAR, color: "auto", fill: color(t.accentDark) } : undefined;
  const nameColor = block ? "FFFFFF" : color(compact ? t.accentDark : t.ink);
  const subColor = block ? "FFFFFF" : color(compact && isPro ? t.textMuted : t.accentDark);
  const contactColor = block ? "FFFFFF" : color(isEarly ? t.textSecondary : t.textMuted);
  const dividerColor = block ? "FFFFFF" : color(compact ? t.textMuted : t.rule);
  const contactSize = half(ctx.contactSize);
  const highlights = highlightItems(sections);
  const subtitle = headerSubtitle(profile as Profile, style.template);

  const contactChildren: (TextRun | ExternalHyperlink)[] = [];
  headerContactParts(profile as Profile, style.template).forEach((part, i) => {
    if (i > 0) contactChildren.push(new TextRun({ text: compact ? "  |  " : "  •  ", color: dividerColor, size: contactSize }));
    const isEmail = isEarly && part.kind === "email";
    const run = new TextRun({
      text: part.text,
      color: isEmail ? color(t.accentDark) : contactColor,
      size: contactSize,
      underline: isEmail ? {} : undefined,
    });
    contactChildren.push(part.href ? new ExternalHyperlink({ link: part.href, children: [run] }) : run);
  });

  const paragraphs: Paragraph[] = [
    new Paragraph({
      alignment: ctx.headerAlign,
      shading: banner,
      spacing: { before: block ? twip(4) : 0, after: compact ? twip(isPro ? 2 : 0.5) : 0 },
      border:
        t.showHeaderRule && !block && !compact
          ? { bottom: { style: BorderStyle.SINGLE, color: color(t.accent), size: 12, space: 6 } }
          : undefined,
      children: [
        new TextRun({
          text: profile.full_name || "Résumé",
          bold: true,
          allCaps: Boolean(style.nameUppercase),
          color: nameColor,
          size: half(style.fontSizes.name),
          characterSpacing: twip(compact ? (isPro ? 0.5 : 0.7) : t.nameLetterSpacing),
        }),
      ],
    }),
  ];

  if (subtitle) {
    paragraphs.push(
      new Paragraph({
        alignment: ctx.headerAlign,
        shading: banner,
        spacing: { before: compact ? 0 : twip(block ? 4 : 8) },
        children: [
          new TextRun({
            text: subtitle,
            bold: true,
            color: subColor,
            size: half(compact ? (isPro ? style.fontSizes.subheading + 1 : style.fontSizes.body) : style.fontSizes.subheading + 1.5),
          }),
        ],
      }),
    );
  }

  const rule = isPro ? { bottom: { style: BorderStyle.SINGLE, color: color(t.rule), size: 8, space: 6 } } : undefined;

  if (contactChildren.length > 0) {
    paragraphs.push(
      new Paragraph({
        alignment: ctx.headerAlign,
        shading: banner,
        spacing: { before: twip(isPro ? 4 : compact ? 1 : 5), after: block && highlights.length === 0 ? twip(8) : 0 },
        border: highlights.length === 0 ? rule : undefined,
        children: contactChildren,
      }),
    );
  }

  if (highlights.length > 0) {
    paragraphs.push(
      new Paragraph({
        alignment: ctx.headerAlign,
        shading: banner,
        spacing: { before: twip(2), after: block ? twip(8) : 0 },
        border: rule,
        children: [new TextRun({ text: highlights.join("  •  "), bold: true, color: block ? "FFFFFF" : color(t.accentDark), size: contactSize })],
      }),
    );
  }

  // Breathing room below the header before the first section.
  paragraphs.push(new Paragraph({ spacing: { after: twip(block ? 8 : compact ? 2 : 4) }, children: [] }));
  return paragraphs;
}

export async function buildResumeDocx(sections: ResumeSection[], style: ResumeStyle, profile: HeaderProfile): Promise<Buffer> {
  const t = resolveTokens(style);
  const page = PAGE[style.pageSize] ?? PAGE.letter;
  const margin = twip(spacingPt(style, "margins"));
  const compact = usesCompactHeader(style.template);
  const centered = style.template === "centered" || style.template === "block";

  const ctx: Ctx = {
    t,
    style,
    sectionGap: spacingPt(style, "section"),
    entryGap: spacingPt(style, "entry"),
    lineHeight: spacingPt(style, "line"),
    centered,
    compact,
    isPro: style.template === "professional",
    isEarly: style.template === "early_career",
    headerAlign: alignment(centered ? "center" : style.headerAlignment),
    contentWidth: page.width - margin * 2,
    contactSize: style.fontSizes.contact ?? style.fontSizes.body - 1,
    datesSize: style.fontSizes.dates ?? style.fontSizes.body - 1,
  };

  const font = RESUME_FONTS[t.fontKey].docx;
  const bodySize = style.fontSizes.body;
  const bulletLevel = (text: string, glyphColor: string) => ({
    level: 0,
    format: LevelFormat.BULLET,
    text,
    alignment: AlignmentType.LEFT,
    style: {
      run: { color: glyphColor, font },
      paragraph: { indent: { left: twip(bodySize * 1.6), hanging: twip(bodySize * 1.1) } },
    },
  });

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
        { reference: BULLETS_REF, levels: [bulletLevel(style.bulletStyle, color(compact ? t.ink : t.accent))] },
        { reference: PLAIN_BULLETS_REF, levels: [bulletLevel("•", color(t.ink))] },
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
        children: [...headerParagraphs(profile, sections, ctx), ...sections.flatMap((s) => sectionParagraphs(s, ctx))],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
