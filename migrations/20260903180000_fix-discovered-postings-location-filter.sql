-- The proactive crawl's 98,000+ cached postings were contributing almost
-- nothing to live searches, and this is why (found 2026-09-03 by measuring
-- what queryProactiveCrawlCache actually returned for real queries: 0 for
-- every single one, including US cities).
--
-- The cause was ordering, not data. search_discovered_postings matched on
-- title only, took the 30 most-recent matches GLOBALLY, and the application
-- then ran filterByCity over those 30. With a cache that is overwhelmingly
-- US-based, the 30 newest "software engineer" rows were Cheltenham, Salt
-- Lake City, Van Wert OH, Chennai, Plano... so a Toronto search filtered all
-- 30 away and got nothing. Meanwhile the cache genuinely held 78 Toronto
-- software-engineer postings -- they simply never made it into the window.
--
-- Filtering by location inside the query fixes it: the limit is now applied
-- to rows that are already city-relevant, so the cache can actually
-- contribute. Location matching deliberately mirrors lib/jobScraper.ts's
-- filterByCity (which still runs afterwards as a second pass, so the two
-- must agree rather than fight):
--   * city = the text before the first comma, matching filterByCity's own
--     `location.split(",")[0]`, so "Toronto, ON" and "Toronto" behave alike;
--   * remote/anywhere postings are kept regardless of city, same as
--     filterByCity's own carve-out -- a genuinely remote role is relevant to
--     a searcher in any city.
--
-- Rows with an UNKNOWN (null/empty) location are deliberately EXCLUDED when
-- a location is supplied. A first version of this migration kept them, on
-- the reasoning that absence of a location isn't evidence of a mismatch --
-- and measuring it immediately showed why that's wrong here. iCIMS list mode
-- returns no location at all, so all ~18,000 of its cached postings have an
-- empty location; keeping them meant a "Registered Nurse"/Toronto search
-- filled its entire 30-row window with unknown-location US postings and
-- crowded out the real city matches. Claiming an unknown-location job is in
-- Toronto is precisely the wrong-city bug filterByCity was added to stop, so
-- the honest behaviour is to leave them out rather than pad the count.
-- Genuine city matches are also ordered ahead of remote ones, so the limit
-- goes to the most relevant rows first.
-- p_location defaults to NULL so any caller that omits it keeps the old
-- title-only behaviour rather than silently getting zero rows.

-- Dropped rather than CREATE OR REPLACE: adding a parameter creates a second
-- overload instead of replacing, and PostgREST cannot disambiguate two
-- functions of the same name when called with the shared argument subset.
DROP FUNCTION IF EXISTS public.search_discovered_postings(text, int);
DROP FUNCTION IF EXISTS public.search_discovered_postings(text, int, text);

CREATE FUNCTION public.search_discovered_postings(
  p_query text,
  p_limit int DEFAULT 30,
  p_location text DEFAULT NULL
)
RETURNS SETOF public.discovered_postings
LANGUAGE sql
STABLE
AS $$
  SELECT *
  FROM public.discovered_postings
  WHERE is_active
    AND title_tsv @@ websearch_to_tsquery('english', p_query)
    AND (
      p_location IS NULL
      OR btrim(split_part(p_location, ',', 1)) = ''
      OR location ILIKE '%' || btrim(split_part(p_location, ',', 1)) || '%'
      -- Only GENUINELY location-independent remote, not a bare '%remote%'
      -- contains-match and not merely a 'remote%' prefix. Both looser
      -- versions were tried against a real Toronto search and both leaked
      -- roles a Toronto candidate cannot take: '%remote%' surfaced "USA,
      -- Wisconsin - Full Time Remote", and 'remote%' still surfaced "Remote
      -- - United States". Most remote roles are remote WITHIN a country or
      -- state, so the word alone means nothing — the accompanying geography
      -- is the signal. This accepts a location that is ONLY a remote marker
      -- ("Remote", "Anywhere", "Remote - Worldwide") and rejects anything
      -- naming a specific place. "Remote - Canada" is rejected too, which
      -- costs a few real matches for Canadian searches; that false negative
      -- is the right side to err on, since showing a wrong-country job is
      -- the failure this whole filter exists to prevent.
      OR location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
    )
  ORDER BY
    -- Real city matches first, remote second, so the limit is spent on the
    -- most relevant rows rather than whatever happens to be newest.
    CASE
      WHEN p_location IS NULL THEN 0
      WHEN location ILIKE '%' || btrim(split_part(p_location, ',', 1)) || '%' THEN 0
      ELSE 1
    END,
    last_seen_at DESC
  LIMIT p_limit
$$;

-- Supports the location predicate above; the existing GIN index on
-- title_tsv already covers the full-text half of the WHERE clause.
CREATE INDEX IF NOT EXISTS discovered_postings_location_idx
  ON public.discovered_postings (location)
  WHERE is_active;
