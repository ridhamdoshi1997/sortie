CREATE TABLE public.usage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  day date NOT NULL DEFAULT CURRENT_DATE,
  action text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  UNIQUE (user_id, day, action)
);

ALTER TABLE public.usage_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_daily_select_own ON public.usage_daily
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY usage_daily_insert_own ON public.usage_daily
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY usage_daily_update_own ON public.usage_daily
  FOR UPDATE USING (auth.uid() = user_id);
