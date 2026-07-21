ALTER TABLE public.profiles
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
