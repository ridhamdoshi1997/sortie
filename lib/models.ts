// Phase 7 model router. Resolved architecture decision (2026-07-19): getModel()
// returns a raw provider client (OpenAI SDK for gemini/openai, official
// @anthropic-ai/sdk for anthropic) rather than the Vercel AI SDK — matches the
// pattern already proven working 3x in this codebase, no new abstraction layer.
// Anthropic specifically must use its own SDK, never an OpenAI-compatible shim.
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminDbClient } from "@/lib/admin/client";

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

// Hardcoded safety-net defaults — as of 2026-08-29 the real source of truth
// is the `ai_model_config` table (admin-editable from /admin/ai-models, no
// redeploy needed), read fresh on every getModel() call below. This object
// only fires when that read fails (missing row, DB blip) — it must never be
// deleted, per the "always keep a hardcoded fallback" gotcha `agy` research
// flagged for exactly this DB-config pattern.
//
// gemini.smart is gemini-3.1-pro-preview, NOT a flash-lite duplicate —
// live-verified 2026-08-29 as a real, addressable model id on this key, but
// the free-tier Gemini key has ZERO Pro-model quota (`limit: 0` on
// generate_content_free_tier_requests, confirmed via a real request, not a
// guess — needs a Google Cloud Billing account linked to unlock real
// quota). Safe to ship anyway: complete()'s GEMINI_FALLBACK_MODELS retry
// chain below already catches the resulting 429 on ANY Gemini call
// (smart tier included) and falls through to a real flash-lite response —
// so this silently degrades to today's exact behavior until billing is
// linked, then starts succeeding with zero further code changes.
export const MODEL_IDS: Record<ModelProvider, Record<ModelTier, string>> = {
  gemini: { fast: "gemini-3.1-flash-lite", smart: "gemini-3.1-pro-preview" },
  openai: { fast: "gpt-4o-mini", smart: "gpt-4o" },
  anthropic: { fast: "claude-haiku-4-5", smart: "claude-sonnet-5" },
};

// ai_model_config has zero client-facing RLS policies (admin-only table,
// same "RLS enabled, no policies = default-deny to anon/authenticated"
// pattern confirmed safe for admin_users/ai_cost_rates during the
// 2026-08-29 security audit) — reading it needs the service-role client,
// not whatever insforge instance (often user-session-scoped) a getModel()
// caller happens to have. getModel() itself takes no insforge param at
// all today, so this constructs its own admin client rather than changing
// every one of its ~40 call sites to also thread one through.
async function resolveModelId(provider: ModelProvider, tier: ModelTier): Promise<string> {
  try {
    const admin = createAdminDbClient();
    const { data } = await admin.database
      .from("ai_model_config")
      .select("model_id")
      .eq("provider", provider)
      .eq("tier", tier)
      .maybeSingle<{ model_id: string }>();
    if (data?.model_id) return data.model_id;
  } catch (error) {
    console.error(`[lib/models] ai_model_config read failed for ${provider}/${tier}, using hardcoded fallback`, error);
  }
  return MODEL_IDS[provider][tier];
}

// 2026-07-27: the primary key hit BOTH its per-minute AND per-day free-tier
// caps for gemini-3.1-flash-lite (confirmed live against the real Google AI
// Studio usage dashboard — 16/15 RPM, 502/500 RPD). Retrying the same model
// can't fix RPD exhaustion — there's no requests left today, period — so
// complete() falls through this list on a 429/503 instead.
//
// The first attempt at this list was guessed from the dashboard's display
// names ("Gemini 2.5 Flash Lite" -> "gemini-2.5-flash-lite") and got it
// wrong — confirmed live, every one of those guesses either 404'd
// ("no longer available to new users" — deprecated for this account
// despite still showing quota on the dashboard) or was an outright invalid
// ID. This list is instead every model that returned a real 200 from a
// live test call against the EXACT endpoint complete() calls (not just
// Google's models.list, which doesn't guarantee the OpenAI-compat layer
// supports a given model): gemini-2.5-flash-lite, gemini-2.5-flash,
// gemini-2.0-flash(-lite), and gemini-3.1-flash-lite-preview all failed
// live (404 deprecated, or 429 "check your plan and billing" — a
// plan-level block, not today's usage) despite looking plausible from the
// model name alone. Re-verify the same way (a real completions call, not a
// models.list check) before adding anything else here.
const GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.5-flash-lite"];

export async function getModel(
  provider: ModelProvider,
  tier: ModelTier = "smart",
): Promise<ModelHandle> {
  const model = await resolveModelId(provider, tier);

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

  // Two-key split, direct user request 2026-08-29 after linking Cloud
  // Billing on GEMINI_API_KEY: billing tier is set per API key/project, not
  // per request, so leaving fast-tier (flash-lite) traffic on the
  // now-paid key would put every free/Recon user's volume on the paid
  // meter too. GEMINI_API_KEY_FAST is a separate, still-free-tier key
  // (confirmed live: zero Pro quota, same as GEMINI_API_KEY was before
  // billing) used only for "fast" — falls back to the paid key if unset,
  // so this degrades to today's single-key behavior rather than breaking
  // if the split key is ever removed from the environment.
  const geminiKey = tier === "fast" ? (process.env.GEMINI_API_KEY_FAST || process.env.GEMINI_API_KEY) : process.env.GEMINI_API_KEY;

  return {
    provider: "gemini",
    model,
    client: new OpenAI({
      apiKey: geminiKey!,
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Process-lifetime memory of which Gemini models are currently known
// rate-limited (model -> timestamp it's safe to try again). Without this, a
// single research request that calls complete() several times in sequence
// (homepage extraction, each sub-page, final synthesis — collectBrowserResearch
// in agent/research.ts does this one call at a time, not in parallel) wastes
// a full retry cycle (~12s) on the primary model on EVERY call, even though
// the very first call in that chain already proved it's exhausted — nothing
// carried that knowledge forward. 60s cooldown matches the free tier's RPM
// window (RPD exhaustion just keeps re-tripping this harmlessly on the next
// window, which is fine — it fails fast into cooldown again rather than
// wasting a full retry cycle re-discovering what's already known).
const modelCooldownUntil = new Map<string, number>();

function isInCooldown(model: string): boolean {
  const until = modelCooldownUntil.get(model);
  return until !== undefined && Date.now() < until;
}

function markCooldown(model: string): void {
  modelCooldownUntil.set(model, Date.now() + 60_000);
}

// The free-tier gemini-3.1-flash-lite key this project uses is rate-limited
// to 15 requests/minute (confirmed live from a real 429 response) — a
// single call in a request that fires several in quick succession (e.g.
// company research's per-page extraction + synthesis) can trip it even
// though the request as a whole is well within reason. scripts/
// backfill-job-structure.mjs already retries on 429/503/UNAVAILABLE with
// backoff for its own bulk use case; this is the same idea applied here so
// EVERY call site that goes through complete() (evaluator, research,
// document generation/chat) gets it, not just the one script. Capped at 3
// attempts with a shorter backoff than the bulk script's — this runs
// inside a live user-facing request, not an unattended background job, so
// it can't afford to wait 15-75s per retry.
async function withRateLimitRetry<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const isRateLimited = status === 429 || status === 503;
      if (!isRateLimited || attempt === maxAttempts) {
        throw error;
      }
      const waitMs = 4000 * attempt;
      console.error(`[lib/models] ${status} — retrying after ${waitMs}ms (attempt ${attempt}/${maxAttempts})`);
      await sleep(waitMs);
    }
  }
  // Unreachable — the loop always returns or throws — but keeps TypeScript
  // happy about a guaranteed return value.
  throw new Error("withRateLimitRetry: exhausted attempts without returning or throwing");
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

    const response = await withRateLimitRetry(() =>
      handle.client.messages.create({
        model: handle.model,
        max_tokens: args.maxTokens,
        system: args.systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    );

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock || !textBlock.text) {
      throw new Error("Anthropic returned an empty response");
    }

    return args.jsonResponse ? stripJsonFences(textBlock.text) : textBlock.text;
  }

  // Only gemini has a real fallback chain (see GEMINI_FALLBACK_MODELS above)
  // — openai has just the one configured model per tier, nothing to fall
  // back to, so it stays a single attempt same as before.
  const modelsToTry =
    handle.provider === "gemini"
      ? [handle.model, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== handle.model)]
      : [handle.model];

  let lastError: unknown;
  let triedAny = false;
  for (const model of modelsToTry) {
    // Skip a model we already know is rate-limited from an earlier call in
    // this same process (e.g. an earlier step in this same research
    // request) — unless it's the only option left, in which case trying it
    // anyway (and getting a fast 429) beats throwing with no attempt at all.
    if (isInCooldown(model) && model !== modelsToTry[modelsToTry.length - 1]) {
      console.error(`[lib/models] ${model} in cooldown from an earlier call this request — skipping straight to next fallback`);
      continue;
    }

    triedAny = true;
    try {
      const response = await withRateLimitRetry(() =>
        handle.client.chat.completions.create({
          model,
          max_tokens: args.maxTokens,
          temperature: args.temperature,
          ...(args.jsonResponse
            ? { response_format: { type: "json_object" as const } }
            : {}),
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userPrompt },
          ],
        }),
      );

      const raw = response.choices[0].message.content;
      if (!raw) {
        throw new Error(`${handle.provider} returned an empty response`);
      }

      return raw;
    } catch (error) {
      lastError = error;
      const status = (error as { status?: number })?.status;
      // Only fall through to the next model on rate-limit/exhaustion —
      // anything else (bad request, auth failure, etc.) is a real bug that
      // silently trying a different model would just mask.
      if (status !== 429 && status !== 503) {
        throw error;
      }
      markCooldown(model);
      console.error(`[lib/models] ${model} exhausted (${status}) — trying next fallback`);
    }
  }

  if (!triedAny) {
    throw new Error("[lib/models] all candidate models were in cooldown and none were attempted");
  }

  throw lastError;
}
