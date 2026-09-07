-- The crawl cache had no size limit, which is the actual bug behind the storage
-- crisis. discovered_postings only ever grew: the crawl adds every posting it
-- finds across 68,291 companies and never removes anything, so an append-only
-- table was pointed at a 500 MB free-tier database shared with real user data.
-- Providers were evaluated at length; none of that addressed the growth, it
-- only moved the ceiling.
--
-- A cache in a fixed-size store needs a budget and an eviction rule. Evicting
-- here is not data loss: the crawl revisits every company on a 15-minute cycle,
-- so a posting still live on the employer's board is rewritten on the next
-- pass. Postings that do NOT come back are precisely the ones worth losing --
-- filled, closed or expired -- which is the ghost-job problem this product
-- exists to avoid.

-- 1. Reclaim space that costs nothing to give up, without touching a row.
--
-- The UUID `id` was never used by the application: queryProactiveCrawlCache
-- maps NormalizedJob.id from external_id, not from this column, and every
-- write conflicts on (ats_platform, company_key, external_id). So the column
-- and its 27 MB primary-key index were pure duplication of a natural key that
-- is already unique and already indexed. Promoting that unique index to the
-- primary key keeps a real PK without building a second one.
ALTER TABLE public.discovered_postings DROP CONSTRAINT IF EXISTS discovered_postings_pkey;
ALTER TABLE public.discovered_postings DROP COLUMN IF EXISTS id;
ALTER TABLE public.discovered_postings
  ADD CONSTRAINT discovered_postings_pkey
  PRIMARY KEY USING INDEX discovered_postings_platform_company_external_uidx;

-- discovered_postings_is_active_idx recorded 7 scans, ever. Every query that
-- filters on is_active is already served by a partial index that carries the
-- same predicate (the trigram index is `WHERE is_active`), so a standalone
-- btree on a two-value column earns nothing. company_stem_idx is deliberately
-- KEPT despite being a similar size -- it has 165 scans and serves the
-- posting-liveness identity matching added in Phase 47.
DROP INDEX IF EXISTS public.discovered_postings_is_active_idx;

-- 2. The eviction rule.
--
-- Keeps the p_max_rows most recently SEEN postings and removes the rest.
-- last_seen_at is the right ordering key rather than first_seen_at or
-- posted_at: it is refreshed every time the crawl still finds a posting on its
-- board, so it measures "still real", which is exactly what should survive.
--
-- Deliberately not market-aware. Restricting the cache to target markets was
-- considered and rejected by the product owner: every market stays, and the
-- budget decides what fits.
CREATE OR REPLACE FUNCTION public.evict_discovered_postings_over_budget(p_max_rows int)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted int;
BEGIN
  WITH doomed AS (
    SELECT ctid
    FROM public.discovered_postings
    ORDER BY last_seen_at DESC
    OFFSET p_max_rows
  )
  DELETE FROM public.discovered_postings d
  USING doomed
  WHERE d.ctid = doomed.ctid;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
