// Shared writing-style rules injected into every résumé/cover-letter
// generation prompt in the app — one source of truth so a future tweak
// doesn't need to be repeated across 9 separate call sites (agent/documents.ts's
// 4 generate/revise prompts, actions/documents.ts's rewriteResumeBullet,
// actions/profile.ts's rewriteBullet/splitBullet/generateBullets,
// actions/resumes.ts's rewriteResumeSlotBullet).
//
// HUMANIZED_WRITING_RULES's specific bans (em dashes, "delve"/"boasts"/
// "crucial"-class vocabulary, "not just X but Y" constructions, vague
// unquantified "-ing" tails, mechanical rule-of-three lists, copula
// avoidance like "serves as" instead of "is") are drawn directly from
// Wikipedia's "Signs of AI writing" (en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing),
// filtered down to the patterns that actually apply to prose (the page's
// wikitext/citation/template-specific sections don't apply here) —
// per explicit user direction, 2026-08-13.
export const HUMANIZED_WRITING_RULES = `Write like a real person, not an AI model. Specifically:
- Never use em dashes (—) for a parenthetical aside — use a period, a comma, or parentheses instead.
- Never use these overused AI-writing words and phrases: delve, boasts, crucial, meticulous, meticulously, intricate, intricacies, tapestry, testament, vibrant, underscore, underscores, pivotal, garner, robust, leverage (as a verb meaning "use"), foster, fostering, streamline, seamless, cutting-edge, dynamic, innovative, passionate about, results-oriented, proven track record, game-changer, unlock, unlocking, elevate, empower, holistic, synergy, plays a crucial role, plays a pivotal role, at the forefront of, in today's fast-paced world, in today's ever-evolving landscape.
- Never use "not just X, but Y", "not X, but Y", or "X rather than Y" rhetorical-contrast sentence constructions.
- Never end a sentence with a vague, unquantified "-ing" clause (e.g. "...ensuring seamless operations", "...fostering collaboration"). If there's a real result worth stating, state it as an actual number; if there's no number, cut the clause instead of writing a vague one.
- Avoid mechanical "rule of three" lists (three adjectives or three short phrases in a row) unless all three are genuinely distinct, real facts — don't pad for rhythm.
- Say what happened plainly and directly ("led", "built", "was") instead of inflated substitutes ("serves as", "stands as", "functions as").
- Vary sentence length and rhythm the way a real person writes — don't make every line the same length and shape.`;

// Bullet-specific rules (résumé work-experience content, not cover-letter
// prose) — per explicit user direction, 2026-08-13: quantify goals/
// achievements with no negative framing, mirror the target job posting's
// own key action words, and structure each bullet on Google's XYZ formula
// ("Accomplished X as measured by Y, by doing Z" — the résumé-writing
// framework popularized by Google's former SVP of People Ops, Laszlo Bock).
//
// Placeholders are BANNED here, and XYZ is no longer applied by default.
// Both were removed 2026-09-11 on direct user instruction, in two steps.
//
// The bracket rule was added 2026-09-10 as a third option between inventing
// a number (dishonest) and dropping it silently (unhelpful). It backfired:
// with nothing pushing the model toward the other two, a placeholder became
// the default and a real résumé came back with "[X]%" in nearly every
// bullet. Capping the count was tried first and was not enough — the user's
// answer was decisive: "we can't put the placeholders for users, then
// what's the meaning of having the resume editor." They are right. If a
// figure is missing, the product's job is to COLLECT it through the editor,
// not to ship a document with blanks and make the candidate finish it.
//
// So the default is now: real numbers where the candidate's own material
// has them, strong number-free writing where it doesn't, and never a blank.
// Google's XYZ formula — and the other frameworks in RESUME_FRAMEWORKS
// below — moved to being an explicit opt-in the user chooses, at which
// point the missing inputs are gathered from them first. A framework
// applied to data nobody has is exactly what produced the brackets.
export const BULLET_QUALITY_RULES = `Write each bullet as a finished sentence: concrete result first, then how it was achieved. Start with a strong past-tense action verb.

NEVER OUTPUT A PLACEHOLDER. No "[X]", "[Y]", "[Z]", "[X]%", "[$ amount]", "[add % reduction]", "[number]" — no bracketed blank of any kind, and no underscores or ellipses standing in for a missing figure. Every bullet you write must be something the candidate could send to an employer exactly as-is, today, without editing it first. A résumé full of blanks to fill in is an unfinished draft, not a résumé.

METRICS — use a number ONLY when the candidate's own material actually contains one:
1. Re-read their profile, résumé and the original bullet for figures that are genuinely there — team sizes, years, counts of systems/services/clients/regions, percentages, dollar amounts, volumes, timeframes — and use those. This is very often possible when it first looks like it isn't.
2. If there is no real number, write the bullet WITHOUT one. Carry the weight with concrete non-numeric scope drawn from their real experience instead: "across the firm's payments platform", "for multi-environment production deployments", "spanning the bank's retail and commercial lines". A specific, number-free bullet is strong writing; a bullet with a blank in it is not.

Never invent, estimate, or imply a figure that is not grounded in the candidate's actual background.

Frame every accomplishment positively — never phrase a bullet around a shortfall, failure, or what was lacking. Where the target job posting's own language supports it, mirror its exact key action words and terminology (for ATS keyword matching), prioritizing the skills/terms recorded as missing for this candidate over ones already matched, without misrepresenting what the candidate actually did.`;

/**
 * Precedence rule for AI edits the user explicitly asked for.
 *
 * Direct user report (2026-09-11): "if user prompt something which is
 * wrong, AI should listen to user instead of sticking to the prompt we have
 * in the background — user's prompt is primary."
 *
 * The bug was structural, not a missing instruction. Every rewrite prompt
 * said "If a specific instruction is given, follow it" and then appended
 * BULLET_QUALITY_RULES — several hundred words of style rules — AFTER it.
 * The user's actual ask ended up as one short clause competing with a long,
 * emphatic rule block, so the model reliably obeyed the house style and
 * quietly ignored the person. Asking for a two-line bullet, or a bullet
 * without a metric, or a different opening verb, simply did not work.
 *
 * The one thing a user instruction CANNOT override is fabrication. Style,
 * length, structure, tone and formatting are all preferences and the user
 * owns them. Inventing a number the candidate never earned is not a
 * preference — it is a lie on a document they will be interviewed against,
 * and this app does not ship those. So honesty stays absolute and
 * everything else yields.
 *
 * Append this LAST in the system prompt, after the style rules, so the
 * override is the final word the model reads.
 */
export const USER_INSTRUCTION_PRECEDENCE = `PRECEDENCE — read this after everything above, it overrides it.

If the user gave a specific instruction, that instruction is the primary requirement and OUTRANKS every style, length, structure and formatting rule stated above. Follow it even when it contradicts the house style — if they ask for two lines, write two lines; if they ask you to drop a metric or change the opening verb, do it; if they ask for a format the rules above discourage, use their format. Do not "correct" them back toward the guidance above, and do not silently split the difference.

The ONLY rule the user cannot override is factual honesty: never invent a statistic, percentage, dollar amount, team size, employer, date, or outcome that is not stated or clearly implied in the candidate's own material. If their instruction can only be satisfied by making something up, follow everything else about the instruction and use an explicit placeholder like "[X]%" instead of inventing a value.`;
