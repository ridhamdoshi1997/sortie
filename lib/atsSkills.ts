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
