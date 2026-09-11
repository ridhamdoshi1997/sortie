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
export const GEMINI_FALLBACK_MODELS = ["gemini-flash-lite-latest", "gemini-3-flash-preview", "gemini-3.5-flash-lite"];

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
  /**
   * Gemini 3 models THINK, and their reasoning tokens are billed against
   * max_tokens — so a generous-looking budget can be consumed entirely
   * before a single character of the answer is emitted.
   *
   * Measured on the résumé quality prompt (2026-09-11): at max_tokens 4000
   * the model spent 2,086-3,681 tokens thinking and truncated the JSON
   * **6 times out of 6**, one run producing only 305 completion tokens after
   * 3,681 tokens of thought. With reasoning_effort "low" the same prompt
   * used 649-1,185 thinking tokens and parsed 6 out of 6.
   *
   * Set this to "low" on structured-extraction calls, where the work is
   * formatting known input rather than reasoning about it. Leave it unset
   * for genuinely analytical calls. Ignored by non-Gemini providers.
   */
  reasoningEffort?: "low" | "medium" | "high";
};

/**
 * Truncation is an ERROR for JSON, not a partial result.
 *
 * `finish_reason: "length"` means the model hit max_tokens mid-output. The
 * old code returned that truncated string anyway, so every caller's
 * JSON.parse threw and reported "The AI response was incomplete. Please try
 * again." — a message that described the symptom and hid the cause, and
 * which a retry could not fix because the budget was still too small.
 *
 * Only enforced for jsonResponse callers: truncated JSON is always useless,
 * whereas truncated prose is degraded but can still be worth showing.
 */
function assertNotTruncated(finishReason: string | null | undefined, args: CompletionArgs, model: string): void {
  if (finishReason !== "length") return;
  if (!args.jsonResponse) {
    console.warn(`[lib/models] ${model} hit max_tokens (${args.maxTokens}) — prose response is truncated`);
    return;
  }
  throw new Error(
    `[lib/models] ${model} hit its ${args.maxTokens}-token budget before finishing the JSON response. ` +
      `On a thinking model, reasoning tokens count against this budget — raise maxTokens or pass reasoningEffort: "low".`,
  );
}

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

// Durable, cross-instance counterpart to the cooldown Map above (Phase 52,
// section 3). That Map is per-lambda and request-local by design, so it can
// make THIS process fail fast but can never tell an admin what is happening
// fleet-wide — /admin/ai-models reads ai_model_usage instead.
//
// A raw PostgREST fetch rather than the createAdminDbClient already imported
// above, for one reason: this fires on EVERY completion, and building a fresh
// Supabase client per call to issue one fire-and-forget RPC is waste. The
// import-graph hazard is real but already paid for by resolveModelId's use of
// the same client, so this is not avoiding it — just not adding work.
//
// The window guard is belt-and-braces: this module is reachable from the
// client graph (lib/models.ts -> Navbar.tsx, the import chain that once broke
// the whole app — see lib/admin/client.ts's comment), though complete() is
// only ever called server-side and SUPABASE_SERVICE_ROLE_KEY is not
// NEXT_PUBLIC so it is never inlined into a client bundle regardless.
//
// Fire-and-forget with every error swallowed: this is observability, and an
// AI call must never fail or slow down because bookkeeping did.
function recordModelUsage(provider: ModelProvider, modelId: string, wasFallback: boolean, rateLimited: boolean): void {
  if (typeof window !== "undefined") return;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;

  void fetch(`${url}/rest/v1/rpc/record_model_usage`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      p_provider: provider,
      p_model_id: modelId,
      p_was_fallback: wasFallback,
      p_rate_limited: rateLimited,
    }),
  }).catch(() => {});
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

    // Anthropic signals the same condition as stop_reason "max_tokens" —
    // mapped onto the shared check so a truncated JSON response fails the
    // same way on every provider rather than only on Gemini.
    assertNotTruncated(response.stop_reason === "max_tokens" ? "length" : response.stop_reason, args, handle.model);

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === "text",
    );
    if (!textBlock || !textBlock.text) {
      throw new Error("Anthropic returned an empty response");
    }

    recordModelUsage("anthropic", handle.model, false, false);
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
          // Structured-JSON calls default to LOW reasoning on Gemini.
          //
          // There are ~25 `jsonResponse: true` call sites in this codebase
          // with budgets from 200 to 4000 tokens, every one of them written
          // before the default model became a thinking model. Hand-tuning
          // each is a losing game: the same overflow would come back with
          // the next model change. Defaulting here fixes all of them at
          // once, and a caller doing genuinely analytical JSON work can
          // still pass an explicit reasoningEffort to opt out.
          //
          // Measured on the résumé-quality prompt: default reasoning burned
          // 2,086-3,681 thinking tokens and truncated 6/6; "low" burned
          // 649-1,185 and parsed 6/6.
          ...(handle.provider === "gemini"
            ? { reasoning_effort: args.reasoningEffort ?? (args.jsonResponse ? "low" : undefined) }
            : {}),
          ...(args.jsonResponse
            ? { response_format: { type: "json_object" as const } }
            : {}),
          messages: [
            { role: "system", content: args.systemPrompt },
            { role: "user", content: args.userPrompt },
          ],
        }),
      );

      // Checked BEFORE the empty check: a run that spends its whole budget
      // thinking returns finish_reason "length" with empty content, and
      // "returned an empty response" would misattribute a budget problem to
      // the provider.
      assertNotTruncated(response.choices[0].finish_reason, args, model);

      const raw = response.choices[0].message.content;
      if (!raw) {
        throw new Error(`${handle.provider} returned an empty response`);
      }

      // `model !== modelsToTry[0]` is the whole definition of "this was a
      // fallback": the configured model is always first in the chain, so
      // serving from anything else means the primary already failed.
      recordModelUsage(handle.provider, model, model !== modelsToTry[0], false);
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
      recordModelUsage(handle.provider, model, model !== modelsToTry[0], true);
      console.error(`[lib/models] ${model} exhausted (${status}) — trying next fallback`);
    }
  }

  if (!triedAny) {
    throw new Error("[lib/models] all candidate models were in cooldown and none were attempted");
  }

  throw lastError;
}
