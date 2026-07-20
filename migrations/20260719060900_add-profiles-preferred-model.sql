ALTER TABLE public.profiles
  ADD COLUMN preferred_model text
    CHECK (preferred_model IN ('gemini', 'openai', 'anthropic'));
