-- A lazy migration of profiles.resume_pdf_url into a `resumes` row raced
-- under concurrent page loads (no lock, just check-then-insert) and created
-- 96 duplicate "Base resume" rows for one account before this was caught and
-- cleaned up by hand. This constraint makes that class of bug impossible at
-- the DB level: a second insert of the same (user_id, storage_path) now
-- fails outright instead of silently duplicating, regardless of how many
-- requests race the check.
ALTER TABLE public.resumes
  ADD CONSTRAINT resumes_user_storage_path_key UNIQUE (user_id, storage_path);
