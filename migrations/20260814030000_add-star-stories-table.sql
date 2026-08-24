-- STAR Story Matrix — candidate-tied (not job-tied), one-time story bank the
-- user writes once and matches against any company/role's Question Bank.
-- Per-user CRUD table, zero AI cost, mirrors the accomplishments table shape.
-- accomplishment_id is optional provenance only (no AI auto-fill in v1).
CREATE TABLE public.star_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  situation text NOT NULL,
  task text NOT NULL,
  action text NOT NULL,
  result text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  accomplishment_id uuid REFERENCES accomplishments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX star_stories_user_id_idx ON public.star_stories (user_id);

ALTER TABLE public.star_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY star_stories_select_own ON public.star_stories
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY star_stories_insert_own ON public.star_stories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY star_stories_update_own ON public.star_stories
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY star_stories_delete_own ON public.star_stories
  FOR DELETE USING (auth.uid() = user_id);
