-- Direct user request — an explicit "Other" catch-all for the feedback
-- modal, distinct from 'support' (which stays reserved as the default for
-- the plain, pre-Phase-1 "Contact support" form non-testers still see).

ALTER TABLE public.support_tickets
  DROP CONSTRAINT support_tickets_category_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
    CHECK (category IN ('bug', 'feature_request', 'change_request', 'feedback', 'billing', 'other', 'support'));
