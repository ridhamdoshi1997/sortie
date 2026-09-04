-- Trigram index on discovered_postings.location.
--
-- The location predicate in search_discovered_postings is
-- `location ILIKE '%' || city || '%'` -- a LEADING-wildcard match, which the
-- plain btree index from 20260903180000 cannot serve at all. Without a
-- trigram index the only way to satisfy it is a sequential scan of all
-- 463,705 rows.
--
-- This matters for the widened second pass added the same day to
-- queryProactiveCrawlCache (lib/proactiveAtsCrawl.ts), which fires only when
-- a precise title match comes back thin. That pass matches far more rows on
-- the title side, so the location half has to be cheap or the whole query
-- exceeds the statement timeout -- which is exactly what happened while this
-- index was absent.
--
-- Requires pg_trgm (available on Supabase, created here if missing). Applied
-- as a partial index on is_active only, matching every real query path and
-- keeping it substantially smaller than a full index would be.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS discovered_postings_location_trgm_idx
  ON public.discovered_postings USING gin (location gin_trgm_ops)
  WHERE is_active;
