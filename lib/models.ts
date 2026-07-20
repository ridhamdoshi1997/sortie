// Phase 7 model router. Resolved architecture decision (2026-07-19): getModel()
// returns a raw provider client (OpenAI SDK for gemini/openai, official
// @anthropic-ai/sdk for anthropic) rather than the Vercel AI SDK — matches the
// pattern already proven working 3x in this codebase, no new abstraction layer.
// Anthropic specifically must use its own SDK, never an OpenAI-compatible shim.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

export type ModelProvider = "gemini" | "openai" | "anthropic";
export type ModelTier = "fast" | "smart";

type OpenAICompatHandle = {
  provider: "gemini" | "openai";
  client: OpenAI;
  model: string;
};

type AnthropicHandle = {
  provider: "anthropic";
  client: Anthropic;
  model: string;
};

export type ModelHandle = OpenAICompatHandle | AnthropicHandle;

// Gemini has only one model proven working against this project's key so far —
// fast and smart intentionally resolve to the same model until a second tier
// is verified live, rather than guessing an untested model string.
export const MODEL_IDS: Record<ModelProvider, Record<ModelTier, string>> = {
  gemini: { fast: "gemini-3.1-flash-lite", smart: "gemini-3.1-flash-lite" },
  openai: { fast: "gpt-4o-mini", smart: "gpt-4o" },
  anthropic: { fast: "claude-haiku-4-5", smart: "claude-sonnet-5" },
};

export function getModel(
  provider: ModelProvider,
  tier: ModelTier = "smart",
): ModelHandle {
  const model = MODEL_IDS[provider][tier];

  if (provider === "anthropic") {
    return {
      provider,
      model,
      client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }),
    };
  }

  if (provider === "openai") {
    return {
      provider,
      model,
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }),
    };
  }

  return {
    provider: "gemini",
    model,
    client: new OpenAI({
      apiKey: process.env.GEMINI_API_KEY!,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
  };
}

type CompletionArgs = {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  jsonResponse?: boolean;
};

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

// Normalizes chat completion across providers so call sites don't branch on
// provider shape. JSON mode is enforced natively for gemini/openai via
// response_format; Anthropic has no equivalent on the Messages API, so the
// instruction is appended to the prompt and markdown fences are stripped
// defensively (Claude sometimes wraps JSON in ```json fences despite being
// told not to).
export async function complete(
  handle: ModelHandle,
  args: CompletionArgs,
): Promise<string> {
  if (handle.provider === "anthropic") {
    const userPrompt = args.jsonResponse
      ? `${args.userPrompt}\n\nRespond with ONLY valid JSON — no markdown code fences, no commentary before or after.`
      : args.userPrompt;

    const response = await handle.client.messages.create({
      model: handle.model,
      max_tokens: args.maxTokens,
      system: args.systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock || !textBlock.text) {
      throw new Error("Anthropic returned an empty response");
    }

    return args.jsonResponse ? stripJsonFences(textBlock.text) : textBlock.text;
  }

  const response = await handle.client.chat.completions.create({
    model: handle.model,
    max_tokens: args.maxTokens,
    temperature: args.temperature,
    ...(args.jsonResponse
      ? { response_format: { type: "json_object" as const } }
      : {}),
    messages: [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userPrompt },
    ],
  });

  const raw = response.choices[0].message.content;
  if (!raw) {
    throw new Error(`${handle.provider} returned an empty response`);
  }

  return raw;
}
