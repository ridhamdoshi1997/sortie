-- Direct user request, 2026-08-29: "admin, testers and owners can also see
-- the fast tier models as well in the picking list" — the site-wide model
-- selector (components/shared/SiteModelSelector.tsx) previously only let a
-- full-access user (admin/owner/tester/llmUnlocked) pick a PROVIDER
-- (gemini/openai/anthropic), with the TIER always auto-resolved to "smart"
-- for them. This lets a full-access user also explicitly pick "fast" — for
-- testing what a free/Recon user's actual experience looks like on a given
-- provider — without touching what regular users get (a non-full-access
-- account's tier stays hard-forced to "fast" regardless of this column;
-- see lib/subscription.ts's resolveModelForUser).
ALTER TABLE public.profiles
  ADD COLUMN preferred_tier TEXT NULL CHECK (preferred_tier IN ('fast', 'smart'));
