// Hard vs soft skill classification (Phase 53).
//
// Jobscan scores hard skills far heavier than soft skills, and the research
// reason is sound: recruiters filter their ATS by concrete technical terms,
// and "Leadership" in a skills list is something anyone can type. To present
// the same two buckets, the app has to be able to tell them apart.
//
// A LEXICON, not an AI call. This runs on every keystroke in the résumé
// editor (the ATS card is deliberately always-live and zero-cost — see
// lib/atsChecker.ts's header), so an AI classification per render is both
// unaffordable and non-deterministic. Soft skills are a small, closed,
// slow-moving vocabulary; hard skills are effectively unbounded. So the list
// below enumerates the soft side and everything else is treated as hard,
// which fails in the safe direction: an unrecognised term counts toward the
// heavier bucket rather than being quietly discounted.

const SOFT_SKILL_TERMS = [
  "leadership", "communication", "collaboration", "teamwork", "problem solving", "problem-solving",
  "critical thinking", "time management", "adaptability", "flexibility", "creativity", "innovation",
  "attention to detail", "detail oriented", "detail-oriented", "organization", "organizational",
  "interpersonal", "self motivated", "self-motivated", "self starter", "self-starter", "proactive",
  "work ethic", "reliability", "dependable", "accountability", "ownership", "initiative",
  "analytical", "decision making", "decision-making", "conflict resolution", "negotiation",
  "presentation", "public speaking", "written communication", "verbal communication",
  "customer service", "customer focus", "client facing", "client-facing", "stakeholder management",
  "mentoring", "mentorship", "coaching", "training", "facilitation", "influencing",
  "strategic thinking", "multitasking", "prioritization", "resilience", "empathy",
  "cross functional", "cross-functional", "fast paced", "fast-paced", "independently",
  "team player", "results driven", "results-oriented", "goal oriented", "detail focused",
];

const SOFT_SKILL_SET = new Set(SOFT_SKILL_TERMS);

/**
 * True when a keyword reads as a soft/behavioural trait rather than a
 * concrete, teachable, filterable skill.
 *
 * Matches on the whole normalised term first, then falls back to a
 * word-boundary containment check so "strong leadership skills" and
 * "Leadership" both land in the same bucket.
 */
export function isSoftSkill(keyword: string): boolean {
  const k = keyword.trim().toLowerCase();
  if (!k) return false;
  if (SOFT_SKILL_SET.has(k)) return true;
  return SOFT_SKILL_TERMS.some((term) => {
    if (term.length < 6) return false; // too short to contain-match safely
    return k.includes(term);
  });
}

export function splitSkills(keywords: string[]): { hard: string[]; soft: string[] } {
  const hard: string[] = [];
  const soft: string[] = [];
  for (const k of keywords) {
    (isSoftSkill(k) ? soft : hard).push(k);
  }
  return { hard, soft };
}

// ---------------------------------------------------------------------------
// Does the résumé actually say it? (Phase 55)
//
// The ATS card used to trust the AI fit check's matched/missing lists as
// final. Those are a snapshot from the last AI call, so they went stale the
// moment the user edited: a user report showed "System architecture design"
// listed as missing while the summary said, word for word, "specializing in
// system architecture design", and soft skills stuck at 0/15 after every one
// had been added. ATS parsers match on the TEXT, so this does too, on every
// edit, for free.
// ---------------------------------------------------------------------------

// Words that qualify a skill without being it. "Senior-level leadership" is
// satisfied by leadership, not by the word "senior".
const MODIFIER_WORDS = new Set([
  "senior", "junior", "level", "strong", "excellent", "good", "great", "solid", "proven", "demonstrated",
  "advanced", "basic", "expert", "expertise", "proficiency", "proficient", "knowledge", "understanding",
  "familiarity", "experience", "experienced", "ability", "abilities", "skill", "skills", "and", "or", "of",
  "in", "with", "the", "a", "an", "to", "for", "on", "using", "hands", "based", "plus", "etc",
]);

// Longest first, so "ers" is tried before "er" and "s".
const SUFFIXES = ["ational", "ation", "ition", "ments", "ment", "ships", "ship", "ness", "ings", "ing", "ers", "ed", "es", "er", "ity", "ive", "al", "ly", "s"];

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[‐-―]/g, "-").replace(/\s+/g, " ").trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9+#.]+/)
    .map((t) => t.replace(/\.+$/, ""))
    .filter(Boolean);
}

// Deliberately crude: enough that "collaborated" meets "collaboration" and
// "leading" meets "leadership", without a stemming dependency.
function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 4 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

function stemsMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  if (!longer.startsWith(shorter)) return false;
  // A 4-letter stem may only extend a little: "lead" -> "leader", never
  // "data" -> "database".
  return shorter.length >= 5 || (shorter.length === 4 && longer.length <= 6);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsPhrase(normalizedText: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(phrase)}($|[^a-z0-9])`).test(normalizedText);
}

export type TextIndex = { text: string; words: Set<string>; stems: string[] };

export function buildTextIndex(text: string): TextIndex {
  const words = tokenize(text);
  return { text: normalizeText(text), words: new Set(words), stems: [...new Set(words.map(stem))] };
}

/**
 * True when the indexed text mentions the keyword: the exact phrase first
 * (the only safe test for C#, .NET, Node.js), then every meaningful word of
 * it, allowing for tense and suffix differences.
 */
export function textMentions(index: TextIndex, keyword: string): boolean {
  const phrase = normalizeText(keyword);
  if (!phrase) return false;
  if (containsPhrase(index.text, phrase)) return true;

  const parts = tokenize(phrase).filter((w) => !MODIFIER_WORDS.has(w));
  if (parts.length === 0) return false;
  return parts.every((part) => {
    if (part.length <= 3 || /[+#.]/.test(part)) return index.words.has(part);
    const s = stem(part);
    return index.stems.some((rs) => stemsMatch(rs, s));
  });
}

// Terms that, in a job POSTING, usually describe the company or the job
// rather than a trait asked of the candidate: "our organization", "training
// provided", "a fast-paced environment".
const POSTING_AMBIGUOUS = new Set([
  "organization", "organizational", "training", "presentation", "independently", "fast paced", "fast-paced",
  "flexibility", "cross functional", "cross-functional", "client facing", "client-facing", "reliability",
  "dependable", "innovation", "ownership", "initiative", "facilitation",
]);

// Variants that are the same trait, so one skill is not counted twice.
const SOFT_ALIASES: Record<string, string> = {
  "problem-solving": "problem solving",
  "decision-making": "decision making",
  mentorship: "mentoring",
  "detail oriented": "attention to detail",
  "detail-oriented": "attention to detail",
  "detail focused": "attention to detail",
  "self motivated": "self-motivated",
  "self starter": "self-motivated",
  "self-starter": "self-motivated",
  "team player": "teamwork",
  "results-oriented": "results driven",
  "goal oriented": "results driven",
  "written communication": "communication",
  "verbal communication": "communication",
};

function toLabel(term: string): string {
  return term.charAt(0).toUpperCase() + term.slice(1);
}

let postingCache: { text: string; skills: string[] } | null = null;

/**
 * The soft skills a job posting names, from the same closed lexicon as
 * isSoftSkill. The AI keyword list usually carries only one or two soft
 * terms, so without this the soft-skills category judged the résumé against
 * whatever that one call happened to pick. Cached for the last posting: the
 * ATS card recomputes on every keystroke and the posting does not change.
 */
export function extractPostingSoftSkills(postingText: string): string[] {
  if (postingCache?.text === postingText) return postingCache.skills;
  const text = normalizeText(postingText);
  const found = new Map<string, string>();
  for (const term of SOFT_SKILL_TERMS) {
    if (POSTING_AMBIGUOUS.has(term)) continue;
    if (!containsPhrase(text, term)) continue;
    const canonical = SOFT_ALIASES[term] ?? term.replace(/-/g, " ");
    if (!found.has(canonical)) found.set(canonical, toLabel(canonical));
  }
  const skills = [...found.values()];
  postingCache = { text: postingText, skills };
  return skills;
}
