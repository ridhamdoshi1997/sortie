-- Phase 52, section 4 — moderation for contributed_interview_questions.
--
-- The original migration (20260910000000) closed with an explicit, honest
-- note: v1 auto-publishes, add a status column and an admin review queue
-- "the moment this needs moderating, rather than building an unused one
-- now." This is that moment. The table is public, user-generated, renders
-- on unauthenticated marketing pages, and has had ZERO admin surface.
--
-- Default is 'pending', NOT 'published' — the whole point is that a real
-- person's submission reaches a public SEO page only after someone looked
-- at it. Existing rows are grandfathered to 'published' below because they
-- are already live and retroactively un-publishing them would be a
-- surprise; as of this migration there are 0 of them anyway (verified
-- live), so the backfill is a no-op that exists for correctness if this is
-- ever replayed against a populated database.

ALTER TABLE public.contributed_interview_questions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'rejected')),
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS moderated_by TEXT,
  -- Set when an admin creates the row directly from /admin/interview rather
  -- than it arriving through the public contribute modal. Keeps "real
  -- candidate said this" distinguishable from "we added it", which matters
  -- on a page whose entire value is that the questions are genuine.
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'contributed'
    CHECK (source IN ('contributed', 'admin'));

UPDATE public.contributed_interview_questions
  SET status = 'published'
  WHERE status = 'pending' AND created_at < now();

-- The moderation queue reads by status, and the public hub now filters on
-- it on every read, so both paths want an index.
CREATE INDEX IF NOT EXISTS contributed_interview_questions_status_idx
  ON public.contributed_interview_questions (status, created_at DESC);

-- user_id is NOT NULL and FKs to auth.users, so an admin-authored row still
-- needs an owner. It gets the acting admin's own auth user id, which is
-- truthful (they did submit it) and keeps the FK honest — `source` is what
-- distinguishes it, not a fake or null user.
--
-- Admin writes go through the service-role client, which bypasses RLS
-- entirely, so no new policy is needed for the moderation queue. The
-- existing insert-own/select-own policies stay exactly as they are: a
-- contributor can still submit and still see their own rows, including
-- ones awaiting review.
