import { createAdminDbClient } from "@/lib/admin/client";
import { GEMINI_FALLBACK_MODELS, MODEL_IDS } from "@/lib/models";

// AI Models observability (Phase 52, section 3).
//
// /admin/ai-models could edit which model each provider/tier resolves to and
// carried the global kill switch, but could answer neither question that
// actually comes up in practice: which model is serving the traffic, and is
// anything rate-limited right now. The free Gemini tier has both an RPM and a
// hard daily RPD cap that has bitten this project before (see
// GEMINI_FALLBACK_MODELS' own comment), and when it trips, everything
// silently runs on a fallback with nothing anywhere reporting it.
//
// Everything here reads ai_model_usage, written by lib/models.ts's
// recordModelUsage. Deliberately NOT the in-memory modelCooldownUntil Map —
// that is per-lambda and request-local, so reading it from a page render
// would report one instance's view as if it were the whole fleet.

export type ModelUsageRow = {
  provider: string;
  modelId: string;
  calls: number;
  fallbackCalls: number;
  rateLimited: number;
  lastRateLimitedAt: string | null;
  /** True when this is the model ai_model_config currently resolves to. */
  isConfigured: boolean;
  /** Position in the Gemini fallback chain; null for anything not in it. */
  fallbackRank: number | null;
};

export type ChainLink = {
  modelId: string;
  role: "primary" | "fallback";
  calls: number;
  rateLimited: number;
  lastRateLimitedAt: string | null;
  /**
   * Cooling down is inferred from a rate-limit inside the last 60s — the
   * same window markCooldown() uses. It is a strong hint, not the literal
   * Map: the Map lives in whichever lambda tripped it and cannot be read
   * from here.
   */
  likelyCoolingDown: boolean;
};

export type ModelHealth = {
  usage: ModelUsageRow[];
  /** The Gemini fast-tier chain in the exact order complete() will try it. */
  geminiChain: ChainLink[];
  totalCalls: number;
  totalFallbackCalls: number;
  totalRateLimited: number;
  /** True when no ai_model_usage row exists at all — nothing has run since instrumentation shipped. */
  noDataYet: boolean;
  windowDays: number;
};

const WINDOW_DAYS = 30;
const COOLDOWN_MS = 60_000;

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function getModelHealth(): Promise<ModelHealth> {
  const admin = createAdminDbClient();
  const since = daysAgoIso(WINDOW_DAYS - 1);

  const [{ data: usageRows }, { data: configRows }] = await Promise.all([
    admin.database
      .from("ai_model_usage")
      .select("provider,model_id,calls,fallback_calls,rate_limited,last_rate_limited_at")
      .gte("day", since),
    admin.database.from("ai_model_config").select("provider,tier,model_id"),
  ]);

  const configured = new Set(
    ((configRows ?? []) as { provider: string; tier: string; model_id: string }[]).map(
      (r) => `${r.provider}:${r.model_id}`,
    ),
  );
  // The hardcoded defaults count as configured too — if ai_model_config is
  // unreadable, lib/models.ts serves MODEL_IDS, so a row matching it is not
  // an unexpected model.
  for (const [provider, tiers] of Object.entries(MODEL_IDS)) {
    for (const modelId of Object.values(tiers)) configured.add(`${provider}:${modelId}`);
  }

  // Collapse the per-day rows into per-model totals for the window.
  const byModel = new Map<string, ModelUsageRow>();
  for (const r of (usageRows ?? []) as {
    provider: string;
    model_id: string;
    calls: number;
    fallback_calls: number;
    rate_limited: number;
    last_rate_limited_at: string | null;
  }[]) {
    const key = `${r.provider}:${r.model_id}`;
    const existing = byModel.get(key);
    const fallbackRank = GEMINI_FALLBACK_MODELS.indexOf(r.model_id);
    const merged: ModelUsageRow = existing ?? {
      provider: r.provider,
      modelId: r.model_id,
      calls: 0,
      fallbackCalls: 0,
      rateLimited: 0,
      lastRateLimitedAt: null,
      isConfigured: configured.has(key),
      fallbackRank: fallbackRank === -1 ? null : fallbackRank,
    };
    merged.calls += r.calls;
    merged.fallbackCalls += r.fallback_calls;
    merged.rateLimited += r.rate_limited;
    if (r.last_rate_limited_at && (!merged.lastRateLimitedAt || r.last_rate_limited_at > merged.lastRateLimitedAt)) {
      merged.lastRateLimitedAt = r.last_rate_limited_at;
    }
    byModel.set(key, merged);
  }

  const usage = [...byModel.values()].sort((a, b) => b.calls - a.calls);

  // The fast-tier chain, in the order complete() actually walks it: the
  // configured model first, then GEMINI_FALLBACK_MODELS minus any duplicate
  // of it — the same de-dupe complete() itself applies.
  const configuredGeminiFast =
    ((configRows ?? []) as { provider: string; tier: string; model_id: string }[]).find(
      (r) => r.provider === "gemini" && r.tier === "fast",
    )?.model_id ?? MODEL_IDS.gemini.fast;

  const chainModels = [configuredGeminiFast, ...GEMINI_FALLBACK_MODELS.filter((m) => m !== configuredGeminiFast)];
  const now = Date.now();

  const geminiChain: ChainLink[] = chainModels.map((modelId, i) => {
    const row = byModel.get(`gemini:${modelId}`);
    const last = row?.lastRateLimitedAt ?? null;
    return {
      modelId,
      role: i === 0 ? "primary" : "fallback",
      calls: row?.calls ?? 0,
      rateLimited: row?.rateLimited ?? 0,
      lastRateLimitedAt: last,
      likelyCoolingDown: last !== null && now - new Date(last).getTime() < COOLDOWN_MS,
    };
  });

  return {
    usage,
    geminiChain,
    totalCalls: usage.reduce((s, r) => s + r.calls, 0),
    totalFallbackCalls: usage.reduce((s, r) => s + r.fallbackCalls, 0),
    totalRateLimited: usage.reduce((s, r) => s + r.rateLimited, 0),
    noDataYet: usage.length === 0,
    windowDays: WINDOW_DAYS,
  };
}
