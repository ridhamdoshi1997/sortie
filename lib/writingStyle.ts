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
// Placeholder-bracket rule added 2026-09-10, per explicit user direction
// (a specific ATS/XYZ prompt they use elsewhere): the earlier version of
// this rule just said "never invent a metric that isn't grounded" and left
// it at that, which meant a bullet with no real number in the source data
// silently shipped unquantified — quietly correct, but it threw away the
// information that a metric was MISSING. A bracketed placeholder makes that
// gap visible and actionable to the candidate ("fill this in") instead of
// either inventing a number (dishonest) or omitting it without a trace
// (unhelpful) — it's a third option, not a relaxation of the no-invention
// rule below.
export const BULLET_QUALITY_RULES = `Structure each bullet on Google's XYZ formula: "Accomplished [X] as measured by [Y], by doing [Z]" — lead with the concrete result, back it with a real number, then say how it was achieved. Quantify the goal or achievement whenever the candidate's real experience supports a number (scale, time saved, percentage, dollar amount, team size) — never invent one that isn't grounded in their actual background. When the underlying accomplishment is real but the candidate's own material has no number for it, don't invent one and don't silently drop the metric either — write the bullet with an explicit placeholder like "[X]%" or "[$ amount]" in the Y slot so the candidate can see exactly what to fill in themselves. Frame every accomplishment positively — never phrase a bullet around a shortfall, failure, or what was lacking. Where the target job posting's own language supports it, mirror its exact key action words and terminology (for ATS keyword matching), prioritizing the skills/terms recorded as missing for this candidate over ones already matched, without misrepresenting what the candidate actually did.`;
