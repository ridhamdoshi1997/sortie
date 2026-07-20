ALTER TABLE public.profiles
  ADD COLUMN preferred_resume_theme text
    CHECK (preferred_resume_theme IN ('classic', 'modern', 'minimal'));
