// Structures a raw scraped job posting (jobs.description) into headings,
// paragraphs, and bullet lists for display — presentation only, never
// changes a single word of the real content (direct user request: "the full
// JD as is... with proper sections and bullet points").
//
// Real, verified problems this works around (checked against a broad sample
// of live scraped data, not assumed):
// 1. Bullet items are frequently separated by a bare single newline with NO
//    bullet character at all (verified live, real text: "Competitive
//    compensation\nRemote-first work setups\nHealthcare coverage..."). This
//    is the single most common recoverable pattern — a real, unambiguous
//    delimiter already in the source, just never rendered as one.
// 2. Some postings lose bullet delimiters entirely — items get concatenated
//    with NO separator at all (real text: "...opportunitiesDemonstrate
//    banking technology..."). Recovery here is a best-effort heuristic (a
//    lowercase letter directly touching an uppercase one is very likely a
//    lost bullet boundary) — not guaranteed-perfect, and a real, live-caught
//    false positive exists: a repeated proper noun/brand name with an
//    internal capital (DevOps, GitHub, TransLink) has the exact same shape.
//    Guarded below; see splitIntoListItems.

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

// A small set of extremely common, near-universal section titles that real
// postings often use WITHOUT a trailing colon (e.g. "About Us" on its own
// line, immediately followed by body prose on the very next line with just
// a single \n between them — too tightly glued for the top-level
// paragraph-boundary heading check to catch on its own). Deliberately a
// short, conservative list matched as a WHOLE line, case-insensitively —
// broad fuzzy matching here risks treating an ordinary short first line
// (e.g. a real one found live: "The Client" — a mid-sentence line-wrap
// artifact, not a header) as a false section title.
const KNOWN_STANDALONE_HEADER_PHRASES = new Set([
  "about us",
  "about the company",
  "about the role",
  "about this role",
  "who we are",
  "our mission",
  "your mission",
  "the role",
  "your role",
  "role overview",
  "the opportunity",
  "overview",
  "what you'll do",
  "what you will do",
  "responsibilities",
  "requirements",
  "qualifications",
  "who you are",
  "who we're looking for",
  "what we're looking for",
  "why join us",
  "why you should join us",
  "perks",
  "benefits",
  "compensation",
  "equal opportunity",
  "how to apply",
]);

// Only ever applied to the FIRST line of a multi-line block — a much weaker
// prior than the top-level looksLikeHeading check (which benefits from
// being flanked by real blank lines on both sides). A colon is the safe,
// general signal (matches looksLikeHeading's own bar); anything without one
// must be an exact match against the curated list above, not just "looks
// short," since "The Client" (real, live-caught false case) is just as
// short and unpunctuated as "About Us" but isn't a real header.
function firstLineIsRealHeader(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 60) return false;
  if (trimmed.endsWith(":")) return looksLikeHeading(trimmed);
  const normalized = trimmed.toLowerCase().replace(/[:.]$/, "");
  return KNOWN_STANDALONE_HEADER_PHRASES.has(normalized);
}

// A single bullet item's realistic upper bound — long enough for a real
// multi-clause bullet (verified against real data up to ~300ch), short
// enough to still reject a genuine paragraph that happens to contain one
// stray mid-sentence newline (real live case: "The Client\nAdvisor role is
// pivotal in delivering..." — a 368ch second line, correctly excluded).
const MAX_LIST_LINE_LENGTH = 350;

function splitIntoListItems(block: string): string[] | null {
  const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

  // Real, unambiguous structure already in the source: 2+ genuinely
  // newline-separated lines, none implausibly long for a single bullet.
  // Bullet characters are stripped if present but NOT required — verified
  // live that plenty of real postings separate items with a bare newline
  // and no bullet glyph at all.
  if (lines.length >= 2 && lines.every((l) => l.length > 0 && l.length <= MAX_LIST_LINE_LENGTH)) {
    return lines.map((l) => l.replace(BULLET_CHAR_LINE, "").trim());
  }

  const joined = lines.join(" ");

  // Last resort: a lowercase letter directly followed by an uppercase one,
  // with nothing already separating them, is very likely a lost bullet
  // boundary (see file header comment) — not a normal English pattern
  // otherwise. Only accepted when it yields several reasonably-sized items,
  // so an incidental single transition inside real prose doesn't get
  // shredded into junk fragments.
  const heuristicSplit = joined.split(/(?<=[a-z,)])(?=[A-Z][a-z])/).map((s) => s.trim()).filter(Boolean);
  if (heuristicSplit.length < 3 || !heuristicSplit.every((s) => s.length >= 12)) return null;

  // Guard 1, real false positive caught live: a real compound word/brand
  // name (DevOps, GitHub) has the exact same zero-gap shape as a lost
  // bullet boundary. What distinguishes the false case: splitting on it
  // produces one enormous leftover chunk plus one or two tiny fragments,
  // whereas a real lost-bullet list splits into several comparable-sized
  // items. Reject if any single item swallows more than 40% of the text.
  const totalLength = heuristicSplit.reduce((sum, s) => sum + s.length, 0);
  const maxItemLength = Math.max(...heuristicSplit.map((s) => s.length));
  if (maxItemLength / totalLength > 0.4) return null;

  // Guard 2, a second real false positive caught live: a repeated proper
  // noun (real case: "TransLink" appearing many times in one posting)
  // produces several roughly EVEN-sized fragments — guard 1 alone doesn't
  // catch this, since no single item dominates. But every fragment after
  // the first starts with the same trailing half of that noun ("Link").
  // Reject if more than half the items share the same leading word.
  const firstWords = heuristicSplit.map((s) => (s.match(/^[a-zA-Z]+/) ?? [""])[0].toLowerCase());
  const wordCounts = new Map<string, number>();
  for (const w of firstWords) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  const maxRepeat = Math.max(...wordCounts.values());
  if (maxRepeat / heuristicSplit.length > 0.5) return null;

  return heuristicSplit;
}

// Processes one already-isolated (real \n\n-bounded) block into 1+ display
// blocks — a heading, a heading-plus-body pair, or the fall-through to
// glued-header/list/paragraph handling.
function processBlock(block: string): FormattedBlock[] {
  if (looksLikeHeading(block)) {
    return [{ type: "heading", text: block.replace(/:$/, "") }];
  }

  // Real pattern caught live (AfterShip's "About Us\nAfterShip is..."): a
  // short header-shaped FIRST LINE glued to real body text by just one \n,
  // not the \n\n that would let the check above catch it on its own.
  const lines = block.split("\n");
  if (lines.length > 1 && firstLineIsRealHeader(lines[0])) {
    const headingText = lines[0].trim().replace(/:$/, "");
    const rest = lines.slice(1).join("\n").trim();
    return [{ type: "heading", text: headingText }, ...(rest ? processNonHeadingBlock(rest) : [])];
  }

  return processNonHeadingBlock(block);
}

function processNonHeadingBlock(block: string): FormattedBlock[] {
  // Not already heading-shaped — safe to look for a glued header inside
  // (see insertBreaksBeforeGluedHeaders's own comment for why this only
  // ever runs on non-heading blocks, not the whole raw text up front).
  const subBlocks = insertBreaksBeforeGluedHeaders(block)
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  const result: FormattedBlock[] = [];
  for (const sub of subBlocks) {
    if (looksLikeHeading(sub)) {
      result.push({ type: "heading", text: sub.replace(/:$/, "") });
      continue;
    }

    const items = splitIntoListItems(sub);
    if (items) {
      result.push({ type: "list", items });
    } else {
      result.push({ type: "paragraph", text: sub });
    }
  }
  return result;
}

export function formatJobDescription(raw: string | null | undefined): FormattedBlock[] {
  if (!raw || !raw.trim()) return [];

  const initialBlocks = raw
    .trim()
    .split(/\n\s*\n+/)
    .map((b) => b.trim())
    .filter(Boolean);

  return initialBlocks.flatMap(processBlock);
}
