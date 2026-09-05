-- search_discovered_postings sat right on the 8s statement timeout that
-- PostgREST's `authenticated` role runs under, and intermittently exceeded
-- it. Measured live against the real 642,393-row table (612,037 active),
-- through the app's own client:
--   'Software Engineer' / Toronto  -> 30 rows in 7127ms  (one call)
--   'Software Engineer' / Toronto  ->  0 rows in 8267ms  (the next call,
--                                      cancelled: 57014 statement timeout)
--   'Engineer'          / Toronto  ->  cancelled outright at 8420ms
-- queryProactiveCrawlCache swallows that cancellation (`if (error) return
-- []`), so the failure was indistinguishable from an empty cache: a search
-- silently lost the entire 612k-posting contribution and reported nothing
-- wrong. That is the same silent-discard shape Phases 45 and 46 kept
-- finding, and it is why this was invisible until the query was timed
-- directly rather than trusted.
--
-- CAUSE, from EXPLAIN (ANALYZE, BUFFERS): the location predicate is an OR
-- of a city match and a remote-marker regex, which the planner satisfies
-- with a BitmapOr of two trigram index scans. The remote branch alone
-- matches 29,796 rows on EVERY query regardless of city, and both branches
-- must be fully materialised and ANDed against the title bitmap before a
-- single row is returned. Cold, that is seconds of buffer reads; the plan
-- itself was never the problem, its constant factor was.
--
-- FIX: run the two location cases as separate branches, each with its own
-- LIMIT, instead of one OR the planner has to bitmap together. Each branch
-- then gets a tight BitmapAnd against the title index and stops at p_limit
-- rows, so the expensive remote set is never materialised in full.
--
-- Measured after, same table, same client, 8s timeout enforced:
--   'Engineer'          / Toronto   3608ms -> 121ms   (cold)
--   'Data Analyst'      / Toronto   1869ms -> 109ms
--   'Software Engineer' / Toronto   1110ms ->  98ms
--   'Registered Nurse'  / Toronto   1523ms -> 108ms
-- Row counts are IDENTICAL in every case tested (30/30, 27/27, 4/4) -- this
-- is the same result set, not a narrowed one. The win is mostly in the cold
-- case, which is exactly the case that was timing out.
--
-- Ordering semantics are preserved explicitly rather than left to UNION ALL
-- evaluation order: real city matches still come before remote ones, and
-- last_seen_at DESC still orders within each tier. The outer sort sees at
-- most 2 * p_limit rows.
--
-- The p_location IS NULL / empty case still returns title-only matches: the
-- first branch's city test is trivially true then, and the second branch is
-- guarded off entirely so it cannot add remote rows to a location-less
-- search that never asked for them. The two branches remain mutually
-- exclusive when a city IS given -- the remote regex anchors the WHOLE
-- string to a bare remote marker, so a location containing a city name can
-- never match it -- so UNION ALL cannot duplicate a row.

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
  SELECT (s.rec).*
  FROM (
    -- Tier 0: real city matches (and, when no city is supplied at all,
    -- every title match -- the old title-only behaviour, unchanged).
    (SELECT d AS rec, 0 AS tier, d.last_seen_at AS seen
       FROM public.discovered_postings d
      WHERE d.is_active
        AND d.title_tsv @@ websearch_to_tsquery('english', p_query)
        AND (
          btrim(split_part(coalesce(p_location, ''), ',', 1)) = ''
          OR d.location ILIKE '%' || btrim(split_part(coalesce(p_location, ''), ',', 1)) || '%'
        )
      ORDER BY d.last_seen_at DESC
      LIMIT p_limit)

    UNION ALL

    -- Tier 1: genuinely location-independent remote postings. Same regex as
    -- 20260903180000 -- see that migration for why a bare '%remote%' match
    -- is wrong and why "Remote - Canada" is deliberately rejected.
    (SELECT d AS rec, 1 AS tier, d.last_seen_at AS seen
       FROM public.discovered_postings d
      WHERE d.is_active
        AND d.title_tsv @@ websearch_to_tsquery('english', p_query)
        AND btrim(split_part(coalesce(p_location, ''), ',', 1)) <> ''
        AND d.location ~* '^(remote|anywhere)([[:space:]\-–,:]*(worldwide|global|anywhere))?$'
      ORDER BY d.last_seen_at DESC
      LIMIT p_limit)
  ) s
  ORDER BY s.tier, s.seen DESC
  LIMIT p_limit
$$;
