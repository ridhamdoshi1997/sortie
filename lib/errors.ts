// Central error-message normalizer — the one place raw exceptions get
// turned into copy a user is allowed to see. Researched via 2 `agy` passes
// (2026-08-13, Phase 11): never leak vendor names, HTTP status codes, or
// stack-shaped text; a message the app itself deliberately authored (usage
// caps, rate limits, InsForge auth errors, form validation) is left
// untouched since those are already written for a user, not a developer.
//
// This is a DENYLIST, not a whitelist — only patterns that look like a
// leaked technical/vendor error get rewritten. Everything else (the
// majority of this codebase's existing messages) passes through as-is.
// That's deliberate: rewriting every message through a strict whitelist
// would flatten genuinely useful, already-good copy into a generic
// fallback the first time its exact wording drifts from a hardcoded list.

export const GENERIC_SERVER_ERROR =
  "Something went wrong on our end. Please try again in a moment.";

type Rule = { pattern: RegExp; message: string };

const RULES: Rule[] = [
  // SerpApi — quota exhausted on every configured key. No bare "429" here
  // deliberately — that alone is too generic and would misclassify an AI
  // provider's rate limit (below) as a search-provider one.
  {
    pattern: /run out of searches|out of searches|serpapi.*monthly limit/i,
    message: "We've hit today's search-provider limit. Please try again in a little while.",
  },
  // SerpApi phrases "zero matches" as a data.error string rather than an
  // empty result set — this is a real search outcome, not a failure.
  {
    pattern: /hasn't returned any results/i,
    message: "No listings matched that search. Try a broader title or a nearby location.",
  },
  {
    pattern: /job search failed for location/i,
    message: 'We couldn\'t resolve that location. Try a specific city, e.g. "Toronto, ON".',
  },
  // AI provider (Gemini/OpenRouter/Anthropic) rate limits, cooldowns, or
  // empty completions — several distinct internal messages, one user story.
  // Wording matches the pre-existing, already-shipped copy in
  // actions/profile.ts / lib/resumeQuality.ts rather than introducing a
  // second phrasing for the same real, previously-encountered situation.
  {
    pattern: /429|rate.?limit|resource_exhausted|overloaded|in cooldown|returned an empty response|exhausted attempts|quota/i,
    message: "The AI service is rate-limited right now. Please wait a minute and try again.",
  },
  // Network-level failures (fetch/DNS/timeout) — never mention the vendor.
  {
    pattern: /fetch failed|econnrefused|etimedout|enotfound|network ?error/i,
    message: "We're having trouble connecting right now. Please check your connection and try again.",
  },
  // Raw JS/DB exceptions that shouldn't reach a user verbatim.
  {
    pattern: /^typeerror|^referenceerror|undefined is not|cannot read propert|internal server error|admin sql request failed|missing [a-z_]+_key/i,
    message: GENERIC_SERVER_ERROR,
  },
];

const AI_RATE_LIMIT_MESSAGE = "The AI service is rate-limited right now. Please wait a minute and try again.";

// Exported separately from toUserMessage() because several call sites
// (actions/profile.ts, lib/resumeQuality.ts) need to branch on "was this
// specifically a rate limit" rather than just get a display string —
// previously each duplicated its own 429/quota regex inline.
export function isRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|rate.?limit|resource_exhausted|quota/i.test(message);
}

export function rateLimitMessage(): string {
  return AI_RATE_LIMIT_MESSAGE;
}

export function toUserMessage(error: unknown, fallback: string = GENERIC_SERVER_ERROR): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return fallback;

  const rule = RULES.find((r) => r.pattern.test(raw));
  if (rule) return rule.message;

  // Anything containing a bare "Error:" prefix, a stack frame, or an HTTP
  // status code in parentheses reads as leaked technical output even if it
  // doesn't match a known vendor pattern above.
  if (/^error:|\bat \S+:\d+:\d+\b|\(https?:\/\/|\bhttp \d{3}\b/i.test(raw)) {
    return fallback;
  }

  return raw;
}
