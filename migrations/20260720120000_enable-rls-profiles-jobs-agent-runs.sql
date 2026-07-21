-- Pre-launch security gate: profiles, jobs, and agent_runs held user data
-- with RLS disabled — any authenticated user could read/write any other
-- user's rows through the PostgREST API. Locks all three down with the same
-- own-row four-policy pattern applications/agent_logs already use.
-- The Inngest background pipeline is unaffected: it uses the service-key
-- admin client (lib/inngest/functions.ts), which bypasses RLS.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY profiles_insert_own ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY profiles_delete_own ON public.profiles
  FOR DELETE USING (auth.uid() = id);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select_own ON public.jobs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY jobs_insert_own ON public.jobs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY jobs_update_own ON public.jobs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY jobs_delete_own ON public.jobs
  FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY agent_runs_select_own ON public.agent_runs
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY agent_runs_insert_own ON public.agent_runs
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY agent_runs_update_own ON public.agent_runs
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY agent_runs_delete_own ON public.agent_runs
  FOR DELETE USING (auth.uid() = user_id);
