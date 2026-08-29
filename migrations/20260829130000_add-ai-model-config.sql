-- Admin-editable AI model config, direct user request, 2026-08-29. Model IDs
-- were hardcoded in lib/models.ts's MODEL_IDS constant, requiring a code
-- deploy to change. This table lets the owner change which model id backs
-- each (provider, tier) pair from /admin/ai-models without a redeploy.
--
-- No client-facing RLS policies at all — same "admin-only, service-role
-- writes, RLS enabled with zero policies = default-deny" pattern already
-- confirmed safe for admin_users/ai_cost_rates/etc. during the 2026-08-29
-- security audit. Reads also go through the service-role client from
-- lib/models.ts's getModel() (a server-only file, never called from a
-- client component) — no anon/authenticated policy needed for reads either.
CREATE TABLE public.ai_model_config (
  provider TEXT NOT NULL,
  tier TEXT NOT NULL,
  model_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT,
  PRIMARY KEY (provider, tier)
);

ALTER TABLE public.ai_model_config ENABLE ROW LEVEL SECURITY;

-- Seeded with today's lib/models.ts MODEL_IDS values, EXCEPT gemini/smart —
-- see Part 3 of the plan: the free-tier Gemini key has zero Pro-model quota
-- (confirmed live, `limit: 0` on generate_content_free_tier_requests), so
-- this seeds the real Pro model id now (gemini-3.1-pro-preview, confirmed
-- addressable on this key, just quota-blocked) rather than the placeholder
-- flash-lite duplicate — complete()'s existing GEMINI_FALLBACK_MODELS retry
-- chain already degrades this gracefully to flash-lite on the 429 until
-- Google Cloud Billing is linked, so this is safe to seed immediately.
INSERT INTO public.ai_model_config (provider, tier, model_id) VALUES
  ('gemini', 'fast', 'gemini-3.1-flash-lite'),
  ('gemini', 'smart', 'gemini-3.1-pro-preview'),
  ('openai', 'fast', 'gpt-4o-mini'),
  ('openai', 'smart', 'gpt-4o'),
  ('anthropic', 'fast', 'claude-haiku-4-5'),
  ('anthropic', 'smart', 'claude-sonnet-5');
