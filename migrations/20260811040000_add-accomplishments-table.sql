-- Portable Career Identity MVP (Career OS spine #2) — the running
-- accomplishment log, independent of job search. Kept decoupled from
-- `jobs` (related_job_id is nullable, ON DELETE SET NULL) since most
-- entries won't be tied to a specific application.
CREATE TABLE public.accomplishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  date date NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  -- Distinguishes manually-logged entries from any future auto-suggested
  -- ones (e.g. offering to log a win when a job reaches Offer) — not
  -- building the auto-suggest prompt itself yet, just leaving the column
  -- so it doesn't need a second migration later.
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'job_outcome')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX accomplishments_user_id_idx ON public.accomplishments (user_id);

ALTER TABLE public.accomplishments ENABLE ROW LEVEL SECURITY;

CREATE POLICY accomplishments_select_own ON public.accomplishments
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY accomplishments_insert_own ON public.accomplishments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY accomplishments_update_own ON public.accomplishments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY accomplishments_delete_own ON public.accomplishments
  FOR DELETE USING (auth.uid() = user_id);
