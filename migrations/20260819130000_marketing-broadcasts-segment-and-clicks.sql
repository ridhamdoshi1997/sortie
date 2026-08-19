-- Marketing fast-follows, direct user request ("AI heavy... Marketing"
-- research delivered earlier): real behavioral segmentation off Sortie's
-- own usage data (more valuable than a generic tag system, since it's
-- data no generic ESP has), plus open/click tracking scaffolding.
-- Click/open counts stay genuinely 0 until a domain is verified in Resend
-- and the webhook below is registered — same disclosed constraint as
-- every other email feature this session.

ALTER TABLE public.marketing_broadcasts ADD COLUMN segment TEXT NOT NULL DEFAULT 'all' CHECK (segment IN ('all', 'active_7d', 'inactive_30d'));
ALTER TABLE public.marketing_broadcasts ADD COLUMN opened_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.marketing_broadcasts ADD COLUMN clicked_count INTEGER NOT NULL DEFAULT 0;
