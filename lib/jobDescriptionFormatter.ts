// Structures a raw scraped job posting (jobs.description) into headings,
// paragraphs, and bullet lists for display — presentation only, never
// changes a single word of the real content (direct user request: "the full
// JD as is... with proper sections and bullet points").
//
// Real, verified problem this works around (checked against live scraped
// data 2026-08-30, not assumed): many postings lose their original bullet
// delimiters entirely during scraping — list items get concatenated with
// NO separator at all, e.g. real text: "...opportunitiesDemonstrate banking
// technology...". There is no character-level marker left to split on in
// these cases, so recovery here is a best-effort heuristic (a lowercase
// letter immediately followed by an uppercase one, with nothing else already
// separating them, is very likely a lost bullet boundary) — not a
// guaranteed-perfect reconstruction. Cleaner postings (real newlines, bullet
// characters, or multi-space runs between items) are split on those exact,
// unambiguous delimiters first — the heuristic is only ever a last resort.

export type FormattedBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; items: string[] };

// Common section names seen across real postings, used only to break a
// header that got glued mid-paragraph with no line break at all (e.g. real
// text: "...business partners Requirements:Proven success..."). Postings
// that already put headers on their own line (e.g. "About Kingsdale
// Advisors", "Equity Statement") don't need this list — the generic
// short-standalone-line heuristic below already catches those regardless of
// exact wording. The trailing colon is REQUIRED on every alternative here,
// not optional — a real bug found live: without it, a bare, ordinary use of
// a common word like "duties" inside a normal sentence ("Other duties as
// assigned.") got misread as a section header and split apart. Every glued
// header actually observed in real scraped data carries a colon; only the
// colon-less, standalone-line case is left to the generic heuristic below.
// Known, accepted limitation: some postings separate sections with runs of
// spaces instead of any real newline at all (e.g. real text: "...team
// compliance coordinator    What are the qualifications:    Post-secondary
// qualification..."). This regex only matches the tail of that phrase
// ("qualifications:"), so the resulting heading occasionally comes out
// abbreviated ("qualifications" instead of "What are the qualifications")
// — the body content underneath is still the complete, verbatim original
// text; only the section LABEL is sometimes shortened. Recovering the full
// original phrase would need capturing backward to an arbitrary word
// boundary, which risks pulling in unrelated preceding text instead —
// judged not worth the added complexity/risk for a label-only cosmetic gap.
const GLUED_HEADER_PATTERN =
  /(key )?responsibilities:|(key )?duties(?: and responsibilities)?:|requirements:|(minimum|preferred) qualifications:|qualifications:|nice[- ]to[- ]haves?:|benefits:|perks:|what'?s in it for you:|how to apply:/gi;

// Isolates a glued header onto its own block (breaks on BOTH sides) — with a
// break only before it, the header stayed glued onto the front of whatever
// text followed, which then failed the single-line heading check.
function insertBreaksBeforeGluedHeaders(text: string): string {
  return text.replace(GLUED_HEADER_PATTERN, (match) => `\n\n${match}\n\n`);
}

const BULLET_CHAR_LINE = /^[\s]*[•\-*▪‣◦]\s*/;

function looksLikeHeading(block: string): boolean {
  if (block.includes("\n")) return false;
  const trimmed = block.trim();
  if (trimmed.length === 0 || trimmed.length > 70) return false;
  if (/[.!?]$/.test(trimmed)) return false; // real sentences end a paragraph, not a heading
  const wordCount = trimmed.split(/\s+/).length;
  return wordCount <= 8;
}

function splitIntoListItems(block: string): string[] | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

  // Cleanest case: every line already has a real bullet character.
  if (lines.length >= 2 && lines.every((l) => BULLET_CHAR_LINE.test(l))) {
    return lines.map((l) => l.replace(BULLET_CHAR_LINE, "").trim()).filter(Boolean);
  }

  const joined = lines.join(" ");

  // A multi-space-run split was tried here and dropped — verified live
  // against real data that it's unreliable: some postings use runs of 3+
  // spaces as arbitrary layout padding between unrelated real sentences
  // (e.g. "Job Description     Grade: P4..."), not as a lost bullet
  // boundary, and it was shredding normal prose into false "list items."

  // Last resort: a lowercase letter directly followed by an uppercase one,
  // with nothing already separating them, is very likely a lost bullet
  // boundary (see file header comment) — not a normal English pattern
  // otherwise. Only accepted when it yields several reasonably-sized items,
  // so an incidental single transition inside real prose doesn't get
  // shredded into junk fragments.
  const heuristicSplit = joined.split(/(?<=[a-z,)])(?=[A-Z][a-z])/).map((s) => s.trim()).filter(Boolean);
  if (heuristicSplit.length >= 3 && heuristicSplit.every((s) => s.length >= 12)) {
    // Real false positive caught live testing this against actual data: real
    // compound words/brand names (DevOps, GitHub) are ALSO a lowercase
    // letter directly touching an uppercase one with zero gap — the exact
    // same shape as a genuinely lost bullet boundary, and there's no way to
    // tell them apart from the letters alone. What distinguishes the false
    // case: splitting on "DevOps"/"GitHub" produces one enormous leftover
    // chunk (the rest of the real paragraph) plus one or two tiny fragments,
    // whereas a real lost-bullet list splits into several genuinely
    // comparable-sized items. Reject the split if any single item swallows
    // more than 40% of the total recovered text — that's not "several
    // bullets," that's one incidental mid-word match inside real prose.
    const totalLength = heuristicSplit.reduce((sum, s) => sum + s.length, 0);
    const maxItemLength = Math.max(...heuristicSplit.map((s) => s.length));
    if (maxItemLength / totalLength <= 0.4) {
      return heuristicSplit;
    }
  }

  return null;
}

export function formatJobDescription(raw: string | null | undefined): FormattedBlock[] {
  if (!raw || !raw.trim()) return [];

  // Split on real paragraph boundaries FIRST, before ever touching the
  // glued-header pattern. A real bug found live: running the glued-header
  // substitution over the whole raw text first, then splitting, cut an
  // already-clean standalone header down to a fragment — "What are the
  // qualifications:" (already isolated by real \n\n on both sides in the
  // source) matched only on its own tail ("qualifications:"), so the
  // substitution wrongly inserted a break in the MIDDLE of that one clean
  // line, truncating it to just "qualifications". Splitting first means a
  // block that's already heading-shaped is accepted as-is, in full, and the
  // glued-header pass only ever runs on the long, non-heading blocks where a
  // header genuinely got glued into running prose with no boundary at all.
  const initialBlocks = raw
    .trim()
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const result: FormattedBlock[] = [];

  for (const initialBlock of initialBlocks) {
    if (looksLikeHeading(initialBlock)) {
      result.push({ type: "heading", text: initialBlock.replace(/:$/, "") });
      continue;
    }

    // Not already heading-shaped — safe to look for a glued header inside.
    const subBlocks = insertBreaksBeforeGluedHeaders(initialBlock)
      .split(/\n\s*\n+/)
      .map((b) => b.trim())
      .filter(Boolean);

    for (const block of subBlocks) {
      if (looksLikeHeading(block)) {
        result.push({ type: "heading", text: block.replace(/:$/, "") });
        continue;
      }

      const items = splitIntoListItems(block);
      if (items) {
        result.push({ type: "list", items });
      } else {
        result.push({ type: "paragraph", text: block });
      }
    }
  }

  return result;
}
