-- §Q4c Always-warm résumé — a background suggestion queue, triggered when a
-- new accomplishment is logged, so a user's base résumé bullets stay fresh
-- without them re-writing it from scratch each time. Reviewed through the
-- exact same accept/reject diff-card pattern already built for
-- rewriteResumeBullet (BulletDiffCard) — this table is only the queue, no
-- new UI pattern needed.
CREATE TABLE public.resume_update_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  accomplishment_id uuid NOT NULL REFERENCES public.accomplishments(id) ON DELETE CASCADE,
  suggested_bullet text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX resume_update_suggestions_user_id_idx ON public.resume_update_suggestions (user_id);
CREATE INDEX resume_update_suggestions_status_idx ON public.resume_update_suggestions (user_id, status);

ALTER TABLE public.resume_update_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY resume_update_suggestions_select_own ON public.resume_update_suggestions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY resume_update_suggestions_insert_own ON public.resume_update_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY resume_update_suggestions_update_own ON public.resume_update_suggestions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY resume_update_suggestions_delete_own ON public.resume_update_suggestions
  FOR DELETE USING (auth.uid() = user_id);
