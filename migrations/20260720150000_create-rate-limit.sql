CREATE TABLE public.rate_limit (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  route text NOT NULL,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, route)
);

ALTER TABLE public.rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY rate_limit_select_own ON public.rate_limit
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY rate_limit_insert_own ON public.rate_limit
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY rate_limit_update_own ON public.rate_limit
  FOR UPDATE USING (auth.uid() = user_id);
