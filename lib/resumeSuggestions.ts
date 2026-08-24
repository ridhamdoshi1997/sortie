import { complete, getModel, type ModelProvider } from "@/lib/models";
import { HUMANIZED_WRITING_RULES, BULLET_QUALITY_RULES } from "@/lib/writingStyle";

// §Q4c Always-warm résumé — the one genuinely new piece of the Q4 batch.
// Triggered from the Inngest background job (lib/inngest/functions.ts's
// generateResumeUpdateSuggestion) on every new accomplishment, so this is a
// plain function with no auth/DB access of its own (background context has
// no request cookies) — mirrors lib/bragDoc.ts's split of "lib = pure
// generation, actions = auth + DB" exactly.

export type ResumeSuggestionRoleContext = {
  title: string;
  company: string;
};

const suggestionSystemPrompt = `You are an expert resume writer turning a candidate's freshly logged career accomplishment into a single ready-to-use resume bullet point for their base résumé.

${HUMANIZED_WRITING_RULES}

${BULLET_QUALITY_RULES}

Rules specific to this task:
- Return exactly ONE bullet, one line, roughly 15-25 words.
- Only use facts stated in the accomplishment — never invent a metric, scale, or outcome the input doesn't support.
- Return only valid JSON.`;

export async function generateResumeUpdateSuggestion(
  accomplishmentTitle: string,
  accomplishmentDescription: string | null,
  role: ResumeSuggestionRoleContext,
  provider: ModelProvider = "gemini",
): Promise<string | null> {
  const raw = await complete(getModel(provider, "fast"), {
    systemPrompt: suggestionSystemPrompt,
    userPrompt: `Role: ${role.title} at ${role.company}\nAccomplishment: "${accomplishmentTitle}"${accomplishmentDescription ? ` — ${accomplishmentDescription}` : ""}\n\nReturn JSON with this exact shape: { "bullet": string }`,
    temperature: 0.4,
    maxTokens: 200,
    jsonResponse: true,
  });

  let parsed: { bullet?: string };
  try {
    parsed = JSON.parse(raw) as { bullet?: string };
  } catch (error) {
    console.error("[lib/resumeSuggestions] JSON parse failed", error, raw.slice(0, 300));
    return null;
  }

  return parsed.bullet?.trim() || null;
}
