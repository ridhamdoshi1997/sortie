import { complete, getModel, type ModelProvider, type ModelTier } from "@/lib/models";

// AI-personalized referral copy (Phase 18 item 4, context/RESUME.md) — the
// dependent half of the referral system (item 3). Same "real data in,
// honest AI synthesis out" discipline as the rest of this app: grounded
// only in the user's own real current title/seniority, never inventing
// stats about Sortie or the user's results.
export type ReferralChannel = "linkedin" | "twitter" | "email";

const CHANNEL_BRIEF: Record<ReferralChannel, string> = {
  linkedin: "A LinkedIn post — 2-4 short paragraphs, professional but personable tone, no hashtag spam (at most 2-3 relevant ones).",
  twitter: "A single X/Twitter post — under 280 characters, punchy, no more than 1-2 hashtags.",
  email: "A short personal email to a friend — a greeting, 2-3 sentences, a natural sign-off. Personal tone, not a marketing blast.",
};

const SYSTEM_PROMPT = `You are drafting a referral-share message on behalf of a real Sortie user, in their own voice, for them to review and send themselves.

Rules:
- Never invent statistics about Sortie's results, user counts, or success rates.
- Ground any personal framing only in the real title/seniority given — don't invent specific achievements or numbers for this person.
- Be honest about what Sortie actually is: an AI job-search copilot that scores job fit across 10 dimensions and helps generate tailored documents — not an auto-apply tool.
- The referral link will be appended separately after your text — do not invent or restate a URL yourself.
- Match the channel's real format and length constraints exactly.

Output ONLY the message body — no preamble, no explanation, no quotes around it.`;

export async function generateReferralCopy(
  channel: ReferralChannel,
  currentTitle: string | null,
  provider: ModelProvider,
  tier: ModelTier = "fast",
): Promise<string> {
  const userPrompt = `Channel: ${CHANNEL_BRIEF[channel]}
This user's current title (use only if it fits naturally, otherwise skip it): ${currentTitle?.trim() || "not provided"}`;

  const raw = await complete(await getModel(provider, tier), {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    temperature: 0.7,
    maxTokens: 350,
  });

  return raw.trim();
}
