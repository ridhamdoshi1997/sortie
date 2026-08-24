-- Cover Letter Editor Workspace: the recipient/salutation line was
-- previously hardcoded ("Hiring Team, {company}") with no way to address a
-- specific hiring manager by name. Nullable — null means "use the computed
-- default", matching resume_style/resume_sections' own null-means-default
-- convention from the résumé editor.
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS cover_letter_salutation text;
