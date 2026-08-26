-- Direct user request, mid-Phase-1 build: subscription/billing questions
-- are common enough on a paid product to deserve their own category rather
-- than falling into 'support' or being misfiled as 'bug'.

ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_category_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
    CHECK (category IN ('bug', 'feature_request', 'change_request', 'feedback', 'billing', 'support'));
