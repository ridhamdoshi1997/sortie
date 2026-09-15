import React from "react";
import { Document, Page, Text, View, StyleSheet, Link } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

import { registerResumeFonts } from "@/components/documents/resumePdfFonts";
import { fontKeyForThemeFamily, pdfFontStyle, RESUME_FONTS, type PdfFontStyle } from "@/lib/resumeFonts";
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
  type ContactPart,
} from "@/lib/resumeLayout";
import type { Profile } from "@/types";
import { formatDegree, sectionDisplayLabel, type ResumeFontKey, type ResumeSection, type ResumeStyle } from "@/types/resumeEditor";

// Embedded fonts (Calibri, Cambria, Georgia and Garamond look-alikes) must be
// registered before anything renders, in the browser and on the server alike.
registerResumeFonts();

// Still the shape the AI generation/revision pipeline (agent/documents.ts)
// produces — summary + work_experience are the only AI-authored content;
// skills/education are never AI-written, only ever pulled from the profile
// or hand-edited in the workspace. Callers merge this into a full
// ResumeSection[] via lib/resumeSections.ts before rendering.
export type GeneratedContent = {
  summary: string;
  work_experience: Array<{
    company: string;
    title: string;
    start_date: string;
    end_date: string | null;
    is_current: boolean;
    bullets: string[];
  }>;
};

export type ResumeTheme = "classic" | "modern" | "minimal" | "slate" | "editorial" | "sage";

type Props = {
  profile: Profile;
  sections: ResumeSection[];
  style: ResumeStyle;
};

// Every font a résumé can use stays ATS-safe: no tables or images, real text,
// and either a PDF built-in family or an embedded OFL font with the same
// letter widths as the Word font it stands in for (lib/resumeFonts.ts).
export type ThemeTokens = {
  fontFamily: string;
  fontFamilyBold: string;
  accent: string;
  accentDark: string;
  ink: string;
  textSecondary: string;
  textMuted: string;
  rule: string;
  showHeaderRule: boolean;
  skillStyle: "chip" | "plain";
  nameLetterSpacing: number;
};

export const RESUME_THEMES: Record<ResumeTheme, ThemeTokens> = {
  // Echoes the app's own light-mode accent (--color-accent / --color-accent-dark
  // in app/globals.css) so this default feels on-brand.
  modern: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#c9711f",
    accentDark: "#7a4713",
    ink: "#17181a",
    textSecondary: "#4b4f4c",
    textMuted: "#7a7f7c",
    rule: "#e4e2dc",
    showHeaderRule: true,
    skillStyle: "chip",
    nameLetterSpacing: 0.3,
  },
  // Traditional serif treatment for conservative industries (finance, legal,
  // academia) — plain skill list instead of chips reads less "startup."
  classic: {
    fontFamily: "Times-Roman",
    fontFamilyBold: "Times-Bold",
    accent: "#1f3a5f",
    accentDark: "#13253d",
    ink: "#1a1a1a",
    textSecondary: "#3a3a3a",
    textMuted: "#6b6b6b",
    rule: "#c7c7c7",
    showHeaderRule: true,
    skillStyle: "plain",
    nameLetterSpacing: 0.5,
  },
  // Pure grayscale — no color at all, for the most conservative ATS/print
  // scenarios or anyone who wants zero visual risk.
  minimal: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#1a1a1a",
    accentDark: "#000000",
    ink: "#1a1a1a",
    textSecondary: "#3a3a3a",
    textMuted: "#7a7a7a",
    rule: "#dcdcdc",
    showHeaderRule: false,
    skillStyle: "plain",
    nameLetterSpacing: 1.2,
  },
  // Researched via agy 2026-08-06: a tech-forward, high-contrast theme —
  // steel blue/dark slate accent, airy letter-spacing on the name.
  slate: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#4682b4",
    accentDark: "#2f4f4f",
    ink: "#1a1a24",
    textSecondary: "#4a5568",
    textMuted: "#a0aec0",
    rule: "#e2e8f0",
    showHeaderRule: true,
    skillStyle: "chip",
    nameLetterSpacing: 1.5,
  },
  // A striking, authoritative serif theme — deep crimson accent on pure
  // black ink, heavy rules, tight classic letter-spacing.
  editorial: {
    fontFamily: "Times-Roman",
    fontFamilyBold: "Times-Bold",
    accent: "#8b0000",
    accentDark: "#5c0000",
    ink: "#000000",
    textSecondary: "#333333",
    textMuted: "#666666",
    rule: "#000000",
    showHeaderRule: true,
    skillStyle: "plain",
    nameLetterSpacing: 0,
  },
  // An approachable, organic theme — sea green/forest accent, no header
  // rule (softer than slate/editorial).
  sage: {
    fontFamily: "Helvetica",
    fontFamilyBold: "Helvetica-Bold",
    accent: "#2e8b57",
    accentDark: "#004d26",
    ink: "#222222",
    textSecondary: "#555555",
    textMuted: "#888888",
    rule: "#d9d9d9",
    showHeaderRule: false,
    skillStyle: "chip",
    nameLetterSpacing: 1.0,
  },
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// Spacing sliders are stored 0-100 (simple for the UI) and mapped to real
// point/line-height ranges only at render time. Exported so StyleTab can
// show the same real units (pt / line-height) next to each slider instead of
// a meaningless raw 0-100 number.
export function mapRange(pct: number, lo: number, hi: number): number {
  return lo + (hi - lo) * (clamp(pct, 0, 100) / 100);
}

export const SPACING_RANGES = {
  section: [8, 32] as const,
  entry: [4, 20] as const,
  line: [1.2, 1.8] as const,
  margins: [30, 60] as const,
};

// Wider ranges (Phase 1, 2026-09-15): the Professional and Early Career
// templates need margins under 30pt and single line spacing, both below the
// original floors. A style opts in with spacingVersion: 2, so a résumé saved
// on the old ranges keeps exactly the spacing it had.
export const SPACING_RANGES_V2 = {
  section: [2, 32] as const,
  entry: [2, 20] as const,
  line: [1.0, 1.8] as const,
  margins: [20, 60] as const,
};

type SpacingKey = keyof ResumeStyle["spacing"];

export function spacingRanges(style: ResumeStyle): Record<SpacingKey, readonly [number, number]> {
  return style.spacingVersion === 2 ? SPACING_RANGES_V2 : SPACING_RANGES;
}

/** A spacing value in real units (pt, or × for line height). */
export function spacingPt(style: ResumeStyle, key: SpacingKey): number {
  const [lo, hi] = spacingRanges(style)[key];
  return mapRange(style.spacing[key], lo, hi);
}

/** The same spacing re-expressed on the version-2 ranges, so a slider move doesn't jump. */
export function upgradeSpacing(style: ResumeStyle): ResumeStyle {
  if (style.spacingVersion === 2) return style;
  const toV2 = (key: SpacingKey) => {
    const [lo, hi] = SPACING_RANGES_V2[key];
    return Math.round(clamp(((spacingPt(style, key) - lo) / (hi - lo)) * 100, 0, 100));
  };
  return {
    ...style,
    spacingVersion: 2,
    spacing: { section: toV2("section"), entry: toV2("entry"), line: toV2("line"), margins: toV2("margins") },
  };
}

export type ResolvedTokens = ThemeTokens & {
  fontKey: ResumeFontKey;
  regular: PdfFontStyle;
  bold: PdfFontStyle;
  italic: PdfFontStyle;
  boldItalic: PdfFontStyle;
};

// Exported so CoverLetterPDF can resolve the same font, palette and
// accent-override logic against the shared ResumeStyle.
export function resolveTokens(style: ResumeStyle): ResolvedTokens {
  const base = RESUME_THEMES[style.theme] ?? RESUME_THEMES.modern;
  const spec = RESUME_FONTS[style.fontFamily ?? fontKeyForThemeFamily(base.fontFamily)] ?? RESUME_FONTS.arial;
  const regular = pdfFontStyle(spec, false, false);
  const bold = pdfFontStyle(spec, true, false);

  let tokens: ResolvedTokens = {
    ...base,
    fontKey: spec.key,
    fontFamily: regular.fontFamily,
    fontFamilyBold: bold.fontFamily,
    regular,
    bold,
    italic: pdfFontStyle(spec, false, true),
    boldItalic: pdfFontStyle(spec, true, true),
  };

  // A template's own palette replaces the theme's colors.
  if (style.colors) {
    tokens = {
      ...tokens,
      accent: style.colors.accent,
      accentDark: style.colors.accentDark,
      ink: style.colors.ink,
      textSecondary: style.colors.body,
      textMuted: style.colors.muted,
      rule: style.colors.rule,
    };
  }

  // A picked accent swatch still wins over either. On a template palette the
  // rules follow it too, since those templates draw their rules in the accent.
  if (style.accentColorOverride) {
    tokens = {
      ...tokens,
      accent: style.accentColorOverride,
      accentDark: style.accentColorOverride,
      rule: style.colors ? style.accentColorOverride : tokens.rule,
    };
  }

  return tokens;
}

function createStyles(t: ResolvedTokens, style: ResumeStyle) {
  const sectionGap = spacingPt(style, "section");
  const entryGap = spacingPt(style, "entry");
  const lineHeight = spacingPt(style, "line");
  const margin = spacingPt(style, "margins");
  // Bullet lines sit a touch tighter than prose, but never below single spacing.
  const bulletLine = Math.max(1, lineHeight - 0.1);
  const compact = usesCompactHeader(style.template);
  const isPro = style.template === "professional";
  const isEarly = style.template === "early_career";
  // "centered", "block" and the two compact-header templates always center the
  // header — that is part of each template's identity. headerAlignment only
  // applies where the user actually picks it.
  const alwaysCentered = style.template === "centered" || style.template === "block";
  const headerAlign = alwaysCentered ? "center" : style.headerAlignment;
  const flexAlign = headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start";
  const { name: nameSize, heading: headingSize, subheading: subheadingSize, body: bodySize } = style.fontSizes;
  const contactSize = style.fontSizes.contact ?? bodySize - 1;
  const datesSize = style.fontSizes.dates ?? bodySize - 1;

  // Gutter width is per-GLYPH, not one number for all three.
  //
  // The three allowed marks (• — ▪) have very different advance widths: an
  // em dash is roughly a full em, a round bullet closer to a third. A single
  // shared width either crowds the dash against the text (observed live —
  // "—Led the migration" with no gap at all) or leaves a canyon after a
  // round bullet. Each multiplier is glyph width plus a deliberate ~0.5em
  // of separation.
  const BULLET_GUTTER_EM: Record<ResumeStyle["bulletStyle"], number> = {
    "•": 0.9,
    "▪": 1.05,
    "—": 1.7,
  };
  const bulletGutter = bodySize * (BULLET_GUTTER_EM[style.bulletStyle] ?? 1.0);

  return StyleSheet.create({
    page: {
      paddingTop: margin,
      paddingBottom: margin,
      paddingHorizontal: margin,
      ...t.regular,
      fontSize: bodySize,
      color: t.ink,
    },
    header: {
      marginBottom: compact ? 2 : 14,
      alignItems: flexAlign,
    },
    name: {
      fontSize: nameSize,
      ...t.bold,
      color: compact ? t.accentDark : t.ink,
      letterSpacing: compact ? (isPro ? 0.5 : 0.7) : t.nameLetterSpacing,
      textAlign: headerAlign,
      textTransform: style.nameUppercase ? "uppercase" : "none",
    },
    headerRule: {
      marginTop: 10,
      borderBottomWidth: 2,
      borderBottomColor: t.accent,
      width: 46,
    },
    subtitle: compact
      ? {
          fontSize: isPro ? subheadingSize + 1 : bodySize,
          ...t.bold,
          color: isPro ? t.textMuted : t.accentDark,
          marginTop: isPro ? 2 : 0.5,
          textAlign: headerAlign,
        }
      : {
          fontSize: subheadingSize + 1.5,
          ...t.bold,
          color: t.accentDark,
          marginTop: 8,
          textAlign: headerAlign,
        },
    // Professional draws a full-width accent rule under the contact line.
    contactBlock: {
      alignSelf: "stretch",
      alignItems: flexAlign,
      marginTop: isPro ? 4 : 1,
      paddingBottom: isPro ? 6 : 0,
      borderBottomWidth: isPro ? 1 : 0,
      borderBottomColor: t.rule,
      marginBottom: isPro ? 2 : 0,
    },
    contactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: compact ? 0 : 5,
      justifyContent: flexAlign,
    },
    contact: {
      fontSize: contactSize,
      color: compact && isEarly ? t.textSecondary : t.textMuted,
    },
    contactEmail: {
      color: t.accentDark,
      textDecoration: "underline",
    },
    contactDivider: {
      fontSize: contactSize,
      color: compact ? t.textMuted : t.rule,
      marginHorizontal: compact ? 5 : 6,
    },
    highlights: {
      fontSize: contactSize,
      ...t.bold,
      color: t.accentDark,
      marginTop: 2,
      textAlign: headerAlign,
    },
    sidebarContactLine: {
      fontSize: contactSize,
      color: t.textMuted,
      marginBottom: 4,
    },
    section: {
      marginTop: sectionGap,
    },
    sectionTitle: compact
      ? {
          fontSize: headingSize,
          ...t.bold,
          color: t.accentDark,
          letterSpacing: isPro ? 1 : 0.4,
          textTransform: "uppercase",
          paddingBottom: 2,
          marginBottom: isPro ? 4 : 2,
          borderBottomWidth: 0.75,
          borderBottomColor: t.rule,
        }
      : {
          fontSize: headingSize,
          ...t.bold,
          color: t.accentDark,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          paddingBottom: 5,
          marginBottom: 9,
          borderBottomWidth: style.template === "block" ? 2.5 : 1,
          borderBottomColor: style.template === "block" ? t.accent : t.rule,
          textAlign: alwaysCentered ? "center" : "left",
        },
    summaryText: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
    },
    strong: {
      ...t.bold,
      color: t.ink,
    },
    skillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillChip: {
      fontSize: bodySize - 1,
      color: t.accentDark,
      borderWidth: 0.75,
      borderColor: t.accent,
      borderRadius: 3,
      paddingVertical: 3,
      paddingHorizontal: 7,
      marginRight: 6,
      marginBottom: 6,
    },
    skillPlainGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
    },
    skillPlainItem: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
      width: `${100 / style.skillsColumns}%`,
      marginBottom: 3,
    },
    skillBulletItem: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
      width: `${100 / style.skillsColumns}%`,
      paddingRight: 6,
      marginBottom: 1.25,
    },
    skillGroupLine: {
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight,
      marginBottom: 3.5,
    },
    jobEntry: {
      marginBottom: entryGap,
    },
    jobHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: 1,
    },
    jobTitle: {
      fontSize: subheadingSize,
      ...t.bold,
      color: t.ink,
      flexShrink: 1,
    },
    jobDates: compact
      ? {
          fontSize: datesSize,
          ...(isPro ? t.italic : t.bold),
          color: t.textMuted,
          marginLeft: 8,
        }
      : {
          fontSize: datesSize,
          color: t.textMuted,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          marginLeft: 8,
        },
    jobCompany: isEarly
      ? {
          fontSize: bodySize,
          ...t.italic,
          color: t.textMuted,
          marginBottom: 1.8,
        }
      : {
          fontSize: subheadingSize - 1,
          ...t.bold,
          color: t.accentDark,
          marginBottom: 4,
        },
    // Company-first roles (Professional): "Company | City" … dates, then the title.
    companyLine: {
      fontSize: subheadingSize,
      ...t.bold,
      color: t.ink,
      flexShrink: 1,
    },
    companyLocation: {
      ...t.regular,
      color: t.textMuted,
    },
    roleLine: {
      fontSize: bodySize,
      ...t.italic,
      color: t.accentDark,
      marginBottom: 2.25,
    },
    // Bullet alignment, rebuilt 2026-09-11 after a direct user report that
    // bullets sat "in the middle and sometimes completely off".
    //
    // Three separate causes, all of them in these three rules:
    //
    //  1. The mark and the text are sibling <Text> nodes, and only the text
    //     carried a lineHeight. Two text runs with different line heights
    //     do not share a baseline, so the glyph floated against the first
    //     line — visibly high on tight line spacing, low on loose.
    //  2. flexDirection "row" defaults to alignItems "stretch", so on any
    //     bullet that wrapped to two or more lines the mark's box stretched
    //     the full height and its glyph drifted toward the vertical middle
    //     of the paragraph instead of sitting on line one.
    //  3. width was a hard 10pt regardless of font size. The three allowed
    //     glyphs (• — ▪) have very different widths, and an em dash at a
    //     larger body size overflowed its box and pushed into the text.
    //
    // Fixed by giving the mark the SAME lineHeight as the text (shared
    // baseline), pinning the row to flex-start (mark stays on line one),
    // and scaling the gutter with the font so it holds at every size.
    bulletRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      marginBottom: compact ? (isPro ? 2.75 : 1.5) : 3,
    },
    bulletMark: {
      fontSize: bodySize - 0.5,
      color: compact ? t.ink : t.accent,
      width: bulletGutter,
      flexShrink: 0,
      lineHeight: bulletLine,
    },
    bulletText: {
      flex: 1,
      fontSize: bodySize,
      color: t.textSecondary,
      lineHeight: bulletLine,
    },
    detailLine: {
      fontSize: bodySize - 0.5,
      ...t.italic,
      color: t.textMuted,
      marginBottom: 1.5,
    },
    linkLine: {
      fontSize: bodySize - 0.5,
      color: t.textMuted,
      marginBottom: 2,
    },
    eduEntry: {
      marginBottom: entryGap * 0.6,
    },
    eduDegree: {
      fontSize: subheadingSize,
      ...t.bold,
      color: t.ink,
    },
    eduDetails: {
      fontSize: bodySize - 1,
      color: t.textMuted,
      marginTop: 2,
    },
    eduRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginTop: 1,
    },
    eduMeta: {
      fontSize: bodySize,
      color: t.textMuted,
      flexShrink: 1,
    },
    eduYears: {
      fontSize: datesSize,
      ...t.bold,
      color: t.textMuted,
      marginLeft: 8,
    },
    certInline: {
      fontSize: bodySize - 0.5,
      color: t.textSecondary,
      lineHeight,
    },
    splitRow: {
      flexDirection: "row",
    },
    sidebar: {
      width: "32%",
      paddingRight: 14,
    },
    main: {
      width: "68%",
      paddingLeft: 18,
    },
    // "executive" — mirrors split's two-column row, but sidebar on the
    // RIGHT (65/35, not 32/68) and no contact block inside it — contact
    // already lives in the full-width header rendered above this row.
    executiveMain: {
      width: "65%",
      paddingRight: 18,
    },
    executiveSidebar: {
      width: "35%",
      paddingLeft: 14,
    },
    // "timeline" — work-experience entries get a dedicated date column
    // instead of a title/dates header row.
    timelineJobEntry: {
      flexDirection: "row",
      marginBottom: entryGap,
    },
    timelineDateCol: {
      width: "20%",
      paddingRight: 8,
    },
    timelineDateText: {
      fontSize: datesSize,
      color: t.textMuted,
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    timelineContentCol: {
      width: "80%",
    },
    // "block" — solid-color header banner, inset within the page margins
    // rather than full-bleed (react-pdf's Yoga layout doesn't handle
    // negative-margin edge-bleed reliably, so this stays a "card" instead).
    // Text is hardcoded white — it sits on accentDark regardless of theme,
    // so it can't use the theme's normal ink/textMuted tokens.
    blockHeader: {
      backgroundColor: t.accentDark,
      borderRadius: 4,
      paddingVertical: 18,
      paddingHorizontal: 20,
      marginBottom: 16,
      alignItems: flexAlign,
    },
    blockName: {
      fontSize: nameSize,
      ...t.bold,
      color: "#ffffff",
      letterSpacing: t.nameLetterSpacing,
      textAlign: headerAlign,
      textTransform: style.nameUppercase ? "uppercase" : "none",
    },
    blockSubtitle: {
      fontSize: subheadingSize + 1.5,
      ...t.bold,
      color: "#ffffff",
      marginTop: 6,
      textAlign: headerAlign,
      opacity: 0.92,
    },
    blockContactRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      marginTop: 6,
      justifyContent: flexAlign,
    },
    blockContact: {
      fontSize: contactSize,
      color: "#ffffff",
      opacity: 0.85,
    },
    blockContactDivider: {
      fontSize: contactSize,
      color: "#ffffff",
      opacity: 0.5,
      marginHorizontal: 6,
    },
    blockHighlights: {
      fontSize: contactSize,
      ...t.bold,
      color: "#ffffff",
      marginTop: 6,
      textAlign: headerAlign,
    },
  });
}

type Styles = ReturnType<typeof createStyles>;

// Text with **bold** runs. The stored text stays plain so ATS parsing and AI
// prompts read it unchanged; only the rendering sets those words in bold.
function Rich({ text, style, strong }: { text: string; style: Style | Style[]; strong: Style }) {
  const runs = parseRich(text);
  if (runs.length === 1 && !runs[0].bold) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {runs.map((run, i) =>
        run.bold ? (
          <Text key={i} style={strong}>
            {run.text}
          </Text>
        ) : (
          run.text
        ),
      )}
    </Text>
  );
}

// Contact info mixes plain text (email/phone/location) with real URLs
// (LinkedIn/portfolio). Only links are wrapped in <Link>; the visible text is
// identical either way, so ATS text extraction is unaffected.
function ContactText({ part, style }: { part: ContactPart; style: Style | Style[] }) {
  if (part.href) {
    return (
      <Link src={part.href} style={style}>
        {part.text}
      </Link>
    );
  }
  return <Text style={style}>{part.text}</Text>;
}

function ContactRow({ parts, styles, style }: { parts: ContactPart[]; styles: Styles; style: ResumeStyle }) {
  const compact = usesCompactHeader(style.template);
  const underlineEmail = style.template === "early_career";
  return (
    <View style={styles.contactRow}>
      {parts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 && <Text style={styles.contactDivider}>{compact ? "|" : "•"}</Text>}
          <ContactText
            part={part}
            style={underlineEmail && part.kind === "email" ? [styles.contact, styles.contactEmail] : styles.contact}
          />
        </React.Fragment>
      ))}
    </View>
  );
}

function renderHeader(profile: Profile, styles: Styles, tokens: ResolvedTokens, style: ResumeStyle, highlights: string[]) {
  const parts = headerContactParts(profile, style.template);
  const subtitle = headerSubtitle(profile, style.template);

  if (usesCompactHeader(style.template)) {
    return (
      <View style={styles.header}>
        <Text style={styles.name}>{profile.full_name ?? ""}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        <View style={styles.contactBlock}>
          {parts.length > 0 && <ContactRow parts={parts} styles={styles} style={style} />}
          {highlights.length > 0 && <Text style={styles.highlights}>{highlights.join("  •  ")}</Text>}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.full_name ?? ""}</Text>
      {tokens.showHeaderRule && <View style={styles.headerRule} />}
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {parts.length > 0 && <ContactRow parts={parts} styles={styles} style={style} />}
      {highlights.length > 0 && <Text style={styles.highlights}>{highlights.join("  •  ")}</Text>}
    </View>
  );
}

// "block" — a solid-color banner instead of a plain header. Text is
// hardcoded white via the block* style keys (createStyles), not the theme's
// normal ink/textMuted tokens, since it sits on accentDark regardless of
// theme choice.
function renderBlockHeader(profile: Profile, styles: Styles, style: ResumeStyle, highlights: string[]) {
  const parts = headerContactParts(profile, style.template);
  const subtitle = headerSubtitle(profile, style.template);

  return (
    <View style={styles.blockHeader}>
      <Text style={styles.blockName}>{profile.full_name ?? ""}</Text>
      {subtitle ? <Text style={styles.blockSubtitle}>{subtitle}</Text> : null}
      {parts.length > 0 && (
        <View style={styles.blockContactRow}>
          {parts.map((part, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Text style={styles.blockContactDivider}>•</Text>}
              <ContactText part={part} style={styles.blockContact} />
            </React.Fragment>
          ))}
        </View>
      )}
      {highlights.length > 0 && <Text style={styles.blockHighlights}>{highlights.join("  •  ")}</Text>}
    </View>
  );
}

// The "split" template moves name/title into the main column (matching the
// real LinkedIn-export résumé layout this project's own test data already
// showed) and contact details into the sidebar instead — a single shared
// header block doesn't fit that layout, so it gets its own two pieces.
function renderSplitMainHeader(profile: Profile, styles: Styles, style: ResumeStyle, highlights: string[]) {
  const subtitle = headerSubtitle(profile, style.template);
  return (
    <View style={styles.header}>
      <Text style={styles.name}>{profile.full_name ?? ""}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {highlights.length > 0 && <Text style={styles.highlights}>{highlights.join("  •  ")}</Text>}
    </View>
  );
}

function renderSplitSidebarContact(profile: Profile, styles: Styles, style: ResumeStyle) {
  const parts = headerContactParts(profile, style.template);
  if (parts.length === 0) return null;
  return (
    <View>
      <Text style={styles.sectionTitle}>Contact</Text>
      {parts.map((part, i) => (
        <ContactText key={i} part={part} style={styles.sidebarContactLine} />
      ))}
    </View>
  );
}

function BulletLine({ text, styles, mark }: { text: string; styles: Styles; mark: string }) {
  return (
    <View style={styles.bulletRow}>
      <Text style={styles.bulletMark}>{mark}</Text>
      <Rich text={text} style={styles.bulletText} strong={styles.strong} />
    </View>
  );
}

function renderSection(section: ResumeSection, styles: Styles, tokens: ResolvedTokens, style: ResumeStyle) {
  const bulletMark = style.bulletStyle;
  const isPro = style.template === "professional";
  const isEarly = style.template === "early_career";
  if (!section.visible) return null;

  // Printed in the header, never as a titled section.
  if (section.type === "highlights") return null;

  if (section.type === "summary") {
    if (!section.content) return null;
    return (
      <View key={section.id} style={styles.section}>
        <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Professional Summary")}</Text>
        <Rich text={section.content} style={styles.summaryText} strong={styles.strong} />
      </View>
    );
  }

  if (section.type === "skills") {
    const skills = allSkills(section);
    if (skills.length === 0) return null;
    const display = resolveSkillsDisplay(style, tokens.skillStyle);
    const title = <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Skills")}</Text>;

    if (display === "grouped") {
      const groups = (section.groups ?? []).filter((g) => g.label.trim() && g.items.some((i) => i.trim()));
      const ungrouped = section.items.map((i) => i.trim()).filter(Boolean);
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {groups.map((group, i) => (
            <Text key={i} style={styles.skillGroupLine}>
              <Text style={styles.strong}>{`${group.label.trim()}:  `}</Text>
              {group.items.map((s) => s.trim()).filter(Boolean).join(", ")}
            </Text>
          ))}
          {ungrouped.length > 0 && <Text style={styles.skillGroupLine}>{ungrouped.join(", ")}</Text>}
        </View>
      );
    }

    if (display === "bulleted") {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          <View style={styles.skillPlainGrid}>
            {skills.map((skill, i) => (
              <Text key={i} style={styles.skillBulletItem}>
                {`•  ${skill}`}
              </Text>
            ))}
          </View>
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.section}>
        {title}
        {display === "chips" ? (
          <View style={styles.skillsRow}>
            {skills.map((skill, i) => (
              <Text key={i} style={styles.skillChip}>
                {skill}
              </Text>
            ))}
          </View>
        ) : (
          <View style={styles.skillPlainGrid}>
            {skills.map((skill, i) => (
              <Text key={i} style={styles.skillPlainItem}>
                {skill}
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (section.type === "work_experience") {
    if (section.entries.length === 0) return null;
    const title = <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Work Experience")}</Text>;

    // "timeline" gets a dedicated date column per entry instead of a
    // title/dates header row — everything else (title/company/bullets)
    // stacks in the remaining content column.
    if (style.template === "timeline") {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {section.entries.map((job, i) => (
            <View key={i} style={styles.timelineJobEntry}>
              <View style={styles.timelineDateCol}>
                <Text style={styles.timelineDateText}>{dateRange(job.start_date, job.end_date, job.is_current)}</Text>
              </View>
              <View style={styles.timelineContentCol}>
                <Text style={styles.jobTitle}>{job.title}</Text>
                <Text style={styles.jobCompany}>{[job.company, job.location].filter(Boolean).join(", ")}</Text>
                {job.bullets?.map((bullet, j) => (bullet ? <BulletLine key={j} text={bullet} styles={styles} mark={bulletMark} /> : null))}
              </View>
            </View>
          ))}
        </View>
      );
    }

    if (style.entryHeader === "company_first") {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {section.entries.map((job, i) => (
            <View key={i} style={styles.jobEntry}>
              <View style={styles.jobHeader}>
                <Text style={styles.companyLine}>
                  {job.company}
                  {job.location ? <Text style={styles.companyLocation}>{`  |  ${job.location}`}</Text> : null}
                </Text>
                <Text style={styles.jobDates}>{dateRange(job.start_date, job.end_date, job.is_current)}</Text>
              </View>
              {job.title ? <Text style={styles.roleLine}>{job.title}</Text> : null}
              {job.bullets?.map((bullet, j) => (bullet ? <BulletLine key={j} text={bullet} styles={styles} mark={bulletMark} /> : null))}
            </View>
          ))}
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.section}>
        {title}
        {section.entries.map((job, i) => (
          <View key={i} style={styles.jobEntry}>
            <View style={styles.jobHeader}>
              <Text style={styles.jobTitle}>{job.title}</Text>
              <Text style={styles.jobDates}>{dateRange(job.start_date, job.end_date, job.is_current)}</Text>
            </View>
            <Text style={styles.jobCompany}>{[job.company, job.location].filter(Boolean).join(", ")}</Text>
            {job.bullets?.map((bullet, j) => (bullet ? <BulletLine key={j} text={bullet} styles={styles} mark={bulletMark} /> : null))}
          </View>
        ))}
      </View>
    );
  }

  if (section.type === "education") {
    const entries = section.entries.filter((e) => e.degree);
    if (entries.length === 0) return null;
    const title = <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Education")}</Text>;

    if (isEarly) {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {entries.map((e, i) => {
            const years = educationYears(e);
            const line = [formatDegree(e.degree, e.field), e.institution, e.location].filter(Boolean).join(", ");
            return <BulletLine key={i} text={years ? `${line} (${years})` : line} styles={styles} mark="•" />;
          })}
        </View>
      );
    }

    if (isPro) {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {entries.map((e, i) => (
            <View key={i} style={styles.eduEntry}>
              <Text style={styles.eduDegree}>{formatDegree(e.degree, e.field)}</Text>
              <View style={styles.eduRow}>
                <Text style={styles.eduMeta}>{[e.institution, e.location].filter(Boolean).join(", ")}</Text>
                {educationYears(e) ? <Text style={styles.eduYears}>{educationYears(e)}</Text> : null}
              </View>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.section}>
        {title}
        {entries.map((e, i) => (
          <View key={i} style={styles.eduEntry}>
            <Text style={styles.eduDegree}>{formatDegree(e.degree, e.field)}</Text>
            <Text style={styles.eduDetails}>{[e.institution, e.location, educationYears(e)].filter(Boolean).join("   •   ")}</Text>
          </View>
        ))}
      </View>
    );
  }

  if (section.type === "certifications") {
    const entries = section.entries.filter((e) => e.name);
    if (entries.length === 0) return null;
    const title = <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Certifications")}</Text>;

    if (style.certificationsDisplay === "inline") {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          <Text style={styles.certInline}>{entries.map(certificationText).join("   |   ")}</Text>
        </View>
      );
    }

    if (isEarly) {
      return (
        <View key={section.id} style={styles.section}>
          {title}
          {entries.map((e, i) => (
            <BulletLine key={i} text={certificationText(e)} styles={styles} mark="•" />
          ))}
        </View>
      );
    }

    return (
      <View key={section.id} style={styles.section}>
        {title}
        {entries.map((e, i) => (
          <View key={i} style={styles.eduEntry}>
            <Text style={styles.eduDegree}>{e.name}</Text>
            {(e.issuer || e.date) && <Text style={styles.eduDetails}>{[e.issuer, e.date].filter(Boolean).join("   •   ")}</Text>}
          </View>
        ))}
      </View>
    );
  }

  // "custom" — a user-defined section (Projects/Languages/Awards/Volunteer
  // Experience/blank). Same entry layout as Work Experience, plus an optional
  // details line (e.g. a tech stack) and a links line.
  const entries = section.entries.filter((e) => e.title || e.subtitle || e.bullets.some(Boolean));
  if (entries.length === 0) return null;
  return (
    <View key={section.id} style={styles.section}>
      <Text style={styles.sectionTitle}>{sectionDisplayLabel(section, "Custom Section")}</Text>
      {entries.map((entry, i) => (
        <View key={i} style={styles.jobEntry}>
          <View style={styles.jobHeader}>
            <Text style={isPro ? styles.companyLine : styles.jobTitle}>{entry.title}</Text>
            {entry.date ? <Text style={styles.jobDates}>{entry.date}</Text> : null}
          </View>
          {entry.subtitle ? <Text style={isPro ? styles.roleLine : styles.jobCompany}>{entry.subtitle}</Text> : null}
          {entry.details ? <Rich text={entry.details} style={styles.detailLine} strong={styles.strong} /> : null}
          {entry.link ? <Text style={styles.linkLine}>{entry.link}</Text> : null}
          {entry.bullets?.map((bullet, j) => (bullet ? <BulletLine key={j} text={bullet} styles={styles} mark={bulletMark} /> : null))}
        </View>
      ))}
    </View>
  );
}

export function ResumePDF({ profile, sections, style }: Props) {
  const tokens = resolveTokens(style);
  const styles = createStyles(tokens, style);
  const pageSize = style.pageSize === "a4" ? "A4" : "LETTER";
  const highlights = highlightItems(sections);

  if (style.template === "split") {
    const sidebarTypes = new Set<ResumeSection["type"]>(["skills", "education", "certifications"]);
    const sidebarSections = sections.filter((s) => sidebarTypes.has(s.type));
    const mainSections = sections.filter((s) => !sidebarTypes.has(s.type));
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          <View style={styles.splitRow}>
            <View style={styles.sidebar}>
              {renderSplitSidebarContact(profile, styles, style)}
              {sidebarSections.map((s) => renderSection(s, styles, tokens, style))}
            </View>
            <View style={styles.main}>
              {renderSplitMainHeader(profile, styles, style, highlights)}
              {mainSections.map((s) => renderSection(s, styles, tokens, style))}
            </View>
          </View>
        </Page>
      </Document>
    );
  }

  // "executive" — like split, but the sidebar sits on the RIGHT (65/35) and
  // the header is full-width, rendered ABOVE the two-column row rather than
  // living inside the sidebar column (contact is already covered by the
  // full-width header, so no separate sidebar-contact block is needed here).
  if (style.template === "executive") {
    const sidebarTypes = new Set<ResumeSection["type"]>(["skills", "education", "certifications"]);
    const sidebarSections = sections.filter((s) => sidebarTypes.has(s.type));
    const mainSections = sections.filter((s) => !sidebarTypes.has(s.type));
    return (
      <Document>
        <Page size={pageSize} style={styles.page}>
          {renderHeader(profile, styles, tokens, style, highlights)}
          <View style={styles.splitRow}>
            <View style={styles.executiveMain}>{mainSections.map((s) => renderSection(s, styles, tokens, style))}</View>
            <View style={styles.executiveSidebar}>{sidebarSections.map((s) => renderSection(s, styles, tokens, style))}</View>
          </View>
        </Page>
      </Document>
    );
  }

  return (
    <Document>
      <Page size={pageSize} style={styles.page}>
        {style.template === "block"
          ? renderBlockHeader(profile, styles, style, highlights)
          : renderHeader(profile, styles, tokens, style, highlights)}
        {sections.map((s) => renderSection(s, styles, tokens, style))}
      </Page>
    </Document>
  );
}
