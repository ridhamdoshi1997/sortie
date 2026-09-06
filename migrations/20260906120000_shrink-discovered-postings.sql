-- The database reached 671 MB against this project's 500 MB plan limit.
-- discovered_postings was 614 MB of that (388 MB heap, 226 MB indexes,
-- 713,946 rows); everything else in the database -- every profile, job,
-- application and resume -- came to about 57 MB.
--
-- Three cuts, cheapest-risk first. Deliberately NOT a plan upgrade: the cache
-- is the only thing over budget, and it is regenerable by design.

-- 1. A dead index. The location predicate is `location ILIKE '%city%'`, a
--    LEADING-wildcard match a plain btree cannot serve at all -- which is why
--    20260904193000 added the trigram index that replaced it. pg_stat_user_indexes
--    recorded 1 scan on this index, ever, against 156 on the trigram one.
DROP INDEX IF EXISTS public.discovered_postings_location_idx;

-- 2. Inactive postings: 77,724 rows the crawl has already marked as no longer
--    appearing on the employer's board. Every read path filters `where is_active`,
--    so these are unreachable by the application today, and the crawl re-inserts
--    anything that reappears. Nothing here is user data.
DELETE FROM public.discovered_postings WHERE NOT is_active;

-- 3. The description column, 65 MB of heap. 20260901120000 capped these at 500
--    chars for this same reason; this finishes that job. Nothing downstream
--    reads it: the pre-filter exempts direct-ATS sources (lib/jobPreFilter.ts),
--    and a posting a candidate actually opens is evaluated from the employer's
--    own live page rather than this table. lib/proactiveAtsCrawl.ts stopped
--    writing and reading it in the same commit as this migration.
ALTER TABLE public.discovered_postings DROP COLUMN IF EXISTS description;

-- VACUUM FULL is NOT run here. Postgres will not return the freed space to
-- disk without it, but it takes an ACCESS EXCLUSIVE lock -- every search
-- reading this table blocks for its duration -- and it cannot run inside a
-- transaction block, which a migration runner may wrap this in. Run it
-- separately, deliberately, when a short stall is acceptable:
--     VACUUM FULL public.discovered_postings;
