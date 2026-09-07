-- Let the index be searched by OCCUPATION, not by title words.
--
-- This is the gap that made index-first search look worse than the old live
-- path. search_discovered_postings matched title_tsv against the query, so
-- "Financial Advisor" only ever RETURNED rows whose titles contain both
-- "financi" and "advisor". The O*NET occupation filter then ran over that set --
-- but a filter can only narrow what SQL already returned, never expand it. So
-- Financial Planner, Investment Advisor and Wealth Advisor rows sat in the index
-- and were never fetched.
--
-- Measured on live Toronto data: the word query returns 22 rows of which 16
-- survive relevance, while 129 postings in the same index are the SAME
-- OCCUPATION as "Financial Advisor". A competitor shows 113 for that search.
--
-- normalized_title stores the same form lib/occupationMatch.ts computes, so a
-- plain join to occupation_titles answers "which occupation is this posting".
-- The SQL below mirrors that normalisation: strip bracketed text, take the part
-- before a comma or dash, drop punctuation, collapse whitespace, then remove up
-- to three leading seniority words.
ALTER TABLE public.discovered_postings ADD COLUMN IF NOT EXISTS normalized_title text;

CREATE OR REPLACE FUNCTION public.normalize_job_title(p_title text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(p_title, '')), '\([^)]*\)', ' ', 'g'),
          '[,\-–|/].*$', '', ''),
        '[^a-z0-9& ]', ' ', 'g'),
      '\s+', ' ', 'g'),
    '^((senior|sr|junior|jr|lead|principal|staff|chief|associate|assistant|experienced|developing) )+', '', ''))
$$;

CREATE INDEX IF NOT EXISTS discovered_postings_normalized_title_idx
  ON public.discovered_postings (normalized_title) WHERE is_active;
