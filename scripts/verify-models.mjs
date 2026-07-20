// Reusable provider health-check for the Phase 7 model router.
// Hits all three real provider keys directly through lib/models.ts's
// getModel()/complete() so "the key is present" is never mistaken for
// "the key actually works." Run with:
//   node --env-file=.env scripts/verify-models.mjs
import { getModel, complete } from "../lib/models.ts";

const providers = ["gemini", "openai", "anthropic"];

for (const provider of providers) {
  try {
    const reply = await complete(getModel(provider, "fast"), {
      systemPrompt: "Reply with exactly one word.",
      userPrompt: "Say OK.",
      maxTokens: 10,
    });
    console.log(`[${provider}] OK — "${reply.trim()}"`);
  } catch (error) {
    console.log(`[${provider}] FAILED — ${error instanceof Error ? error.message : String(error)}`);
  }
}
