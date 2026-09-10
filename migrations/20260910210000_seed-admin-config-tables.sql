-- Seed the admin config tables the Supabase migration left empty.
--
-- Found 2026-09-10 when the user asked why /admin/ai-models lists nothing. A
-- full row-count sweep showed ai_model_config, app_settings and ai_cost_rates
-- all at ZERO rows. The migration carried the schema across and not the
-- seeded configuration, which is a data gap rather than a code bug.
--
-- Nothing was actually broken at runtime, and that is exactly why it went
-- unnoticed for so long: lib/models.ts keeps a hardcoded MODEL_IDS fallback
-- for precisely this case ("it must never be deleted, per the 'always keep a
-- hardcoded fallback' gotcha agy research flagged for exactly this DB-config
-- pattern"), so every AI call has been quietly running on code defaults. What
-- was lost is admin CONTROL and VISIBILITY, not function.
--
-- The values below are therefore not new choices — they are byte-identical to
-- what lib/models.ts is already serving in production today. Seeding them
-- changes no behaviour whatsoever; it only makes the running configuration
-- visible and editable without a redeploy, which is what the table exists for.
INSERT INTO public.ai_model_config (provider, tier, model_id) VALUES
  ('gemini',    'fast',  'gemini-3.1-flash-lite'),
  ('gemini',    'smart', 'gemini-3.1-pro-preview'),
  ('openai',    'fast',  'gpt-4o-mini'),
  ('openai',    'smart', 'gpt-4o'),
  ('anthropic', 'fast',  'claude-haiku-4-5'),
  ('anthropic', 'smart', 'claude-sonnet-5')
ON CONFLICT (provider, tier) DO NOTHING;

-- The singleton settings row. getAppSettings() reads `.eq("id", 1)` and
-- already defaults aiEnabled to true when the row is missing, so the kill
-- switch READS correctly today — but with no row there is nowhere to persist
-- a change to, which is the actual defect.
--
-- ai_enabled starts true: seeding this must not disable AI. crawl_paused
-- likewise starts false, matching the current live state (crawls are running).
INSERT INTO public.app_settings (id, ai_enabled, crawl_paused) VALUES (1, true, false)
ON CONFLICT (id) DO NOTHING;

-- ai_cost_rates is deliberately NOT seeded here.
--
-- It is keyed by UsageAction (30 of them) and holds a hand-maintained
-- cents-per-call estimate. Inventing 30 plausible-looking numbers would make
-- the Expenses page display a confident, precise, and wrong figure — strictly
-- worse than the honest zero it shows now. Real rates need each action mapped
-- to the model it actually calls and costed against real published pricing,
-- which is section 2 of the Phase 52 plan, not this one.
--
-- Note for whoever does section 2: seeding rates alone will NOT make Expenses
-- show a number. usage_daily is also empty, because lib/usage.ts returns early
-- on the ADMIN_EMAILS exemption before reaching increment_usage_daily, and
-- every currently-active account is an admin account. Both halves need
-- resolving together.
