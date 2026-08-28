-- Global full-text search across a user's own job history (build-plan.md
-- §H "Global search" — distinct from the existing Cmd+K palette, which only
-- does a fast ILIKE title/company jump-to via actions/jobs.ts's
-- quickSearchJobs(); this is meant to search everything: description,
-- requirements/responsibilities/nice-to-have/benefits, personal notes,
-- tags, location, job type, and the private "why I left" reflection
-- fields.
--
-- A trigger-maintained tsvector column (not GENERATED ALWAYS AS STORED —
-- Postgres marks the two-arg to_tsvector(regconfig, text) as STABLE, not
-- IMMUTABLE, because the config lookup depends on catalog state, which a
-- generated-column expression rejects outright ("generation expression is
-- not immutable", confirmed live). A BEFORE INSERT/UPDATE trigger is the
-- standard, documented workaround and has the same "computed once on
-- write, not per query" cost profile. Weighted so a title/company match
-- ranks above one buried in the job description. Array columns are
-- flattened via array_to_string since to_tsvector only accepts text.
ALTER TABLE public.jobs ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION public.jobs_search_vector_update() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '') || ' ' || coalesce(NEW.company, '')), 'A') ||
    setweight(
      to_tsvector(
        'english',
        coalesce(NEW.location, '') || ' ' || coalesce(NEW.job_type, '') || ' ' ||
        array_to_string(coalesce(NEW.tags, '{}'::text[]), ' ') || ' ' || coalesce(NEW.personal_notes, '')
      ),
      'B'
    ) ||
    setweight(
      to_tsvector(
        'english',
        coalesce(NEW.about_role, '') || ' ' || coalesce(NEW.description, '') || ' ' ||
        array_to_string(coalesce(NEW.requirements, '{}'::text[]), ' ') || ' ' ||
        array_to_string(coalesce(NEW.responsibilities, '{}'::text[]), ' ') || ' ' ||
        array_to_string(coalesce(NEW.nice_to_have, '{}'::text[]), ' ') || ' ' ||
        array_to_string(coalesce(NEW.benefits, '{}'::text[]), ' ') || ' ' ||
        coalesce(NEW.reflection_loved, '') || ' ' || coalesce(NEW.reflection_avoid, '')
      ),
      'C'
    );
  RETURN NEW;
END;
$$;

CREATE TRIGGER jobs_search_vector_trigger
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.jobs_search_vector_update();

-- Backfill every existing row — the trigger above only fires on future
-- writes.
UPDATE public.jobs SET search_vector =
  setweight(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(company, '')), 'A') ||
  setweight(
    to_tsvector(
      'english',
      coalesce(location, '') || ' ' || coalesce(job_type, '') || ' ' ||
      array_to_string(coalesce(tags, '{}'::text[]), ' ') || ' ' || coalesce(personal_notes, '')
    ),
    'B'
  ) ||
  setweight(
    to_tsvector(
      'english',
      coalesce(about_role, '') || ' ' || coalesce(description, '') || ' ' ||
      array_to_string(coalesce(requirements, '{}'::text[]), ' ') || ' ' ||
      array_to_string(coalesce(responsibilities, '{}'::text[]), ' ') || ' ' ||
      array_to_string(coalesce(nice_to_have, '{}'::text[]), ' ') || ' ' ||
      array_to_string(coalesce(benefits, '{}'::text[]), ' ') || ' ' ||
      coalesce(reflection_loved, '') || ' ' || coalesce(reflection_avoid, '')
    ),
    'C'
  );

CREATE INDEX jobs_search_vector_idx ON public.jobs USING GIN (search_vector);

-- SECURITY INVOKER (the default) so this runs as the calling role and the
-- table's own jobs_select_own RLS policy still applies — the explicit
-- user_id filter below is defense-in-depth / a real index hit, not a
-- substitute for RLS. websearch_to_tsquery (not to_tsquery) so a plain,
-- possibly-messy user-typed query ("remote engineer -contract") parses
-- without erroring on malformed operator syntax the way to_tsquery would.
-- ts_headline pulls a snippet from whichever of about_role/description is
-- actually populated (about_role is the AI-cleaned summary written by
-- lib/evaluator.ts; description is the raw scrape, used as a fallback for
-- older/externally-added jobs that predate the summary field).
CREATE OR REPLACE FUNCTION public.search_jobs(p_query text, p_limit int DEFAULT 30, p_offset int DEFAULT 0)
RETURNS TABLE (
  id uuid,
  title text,
  company text,
  location text,
  application_status text,
  match_score numeric,
  found_at timestamptz,
  company_logo_url text,
  external_apply_url text,
  snippet text,
  rank real
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    j.id,
    j.title,
    j.company,
    j.location,
    j.application_status,
    j.match_score,
    j.found_at,
    j.company_logo_url,
    j.external_apply_url,
    ts_headline(
      'english',
      coalesce(nullif(j.about_role, ''), j.description, ''),
      websearch_to_tsquery('english', p_query),
      'MaxFragments=1,MaxWords=30,MinWords=10,StartSel=<mark>,StopSel=</mark>'
    ) AS snippet,
    ts_rank(j.search_vector, websearch_to_tsquery('english', p_query)) AS rank
  FROM public.jobs j
  WHERE j.user_id = auth.uid()
    AND j.search_vector @@ websearch_to_tsquery('english', p_query)
  ORDER BY rank DESC, j.found_at DESC
  LIMIT p_limit OFFSET p_offset
$$;

GRANT EXECUTE ON FUNCTION public.search_jobs(text, int, int) TO authenticated;
