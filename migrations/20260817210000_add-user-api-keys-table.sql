-- §Q5 Capture Layer — a personal API key generated from Settings, since a
-- Manifest V3 extension's content script can't cleanly share the web app's
-- session cookie. Only the SHA-256 hash of the raw key is ever stored; the
-- raw value is shown to the user exactly once at generation time and never
-- persisted anywhere.
CREATE TABLE public.user_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  label text NOT NULL DEFAULT 'Browser extension',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX user_api_keys_user_id_idx ON public.user_api_keys (user_id);
CREATE INDEX user_api_keys_key_hash_idx ON public.user_api_keys (key_hash);

ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_api_keys_select_own ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_api_keys_insert_own ON public.user_api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_api_keys_delete_own ON public.user_api_keys
  FOR DELETE USING (auth.uid() = user_id);
