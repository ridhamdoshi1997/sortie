-- Phase 40/43: discovered_postings had no way to tell "still open" from
-- "was open once, employer has since removed it" — crawlKnownAtsCompanies
-- only ever upserted, never checked whether a previously-stored posting was
-- missing from a company's CURRENT board response. Adds an is_active flag,
-- defaulting true so every existing row stays visible until the next real
-- crawl of that company either re-confirms or clears it.
ALTER TABLE public.discovered_postings
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS discovered_postings_is_active_idx
  ON public.discovered_postings (is_active)
  WHERE is_active = true;

-- Read side: never surface a posting the employer has removed, even if it
-- still matches the search text.
CREATE OR REPLACE FUNCTION public.search_discovered_postings(p_query text, p_limit integer DEFAULT 30)
 RETURNS SETOF discovered_postings
 LANGUAGE sql
 STABLE
AS $function$
  SELECT *
  FROM public.discovered_postings
  WHERE is_active = true
    AND title_tsv @@ websearch_to_tsquery('english', p_query)
  ORDER BY last_seen_at DESC
  LIMIT p_limit
$function$;
