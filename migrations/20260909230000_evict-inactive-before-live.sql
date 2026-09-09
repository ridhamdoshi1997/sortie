-- Eviction was deleting live inventory to hit a number.
--
-- evict_discovered_postings_over_budget ordered every row (active or not) by
-- last_seen_at and cut whatever fell outside the budget. That is "least
-- recently re-crawled", not "least real" -- and at the 450,000 cap it
-- measurably threw away live jobs: Software Engineer / Toronto went 221 -> 109,
-- Data Analyst 72 -> 60. The comment above the old function already called
-- this out as the thing to fix, not just raise the ceiling on.
--
-- Confirmed again live before this migration (2026-09-09): of the 79,906 rows
-- the old rule would delete to clear the 650,000 budget, 54,810 were still
-- is_active = true. Meanwhile the table holds 92,051 is_active = false rows
-- that mostly weren't touched, because plenty of them are newer-seen than
-- some still-active row from an earlier crawl pass.
--
-- Fixed by evicting in two passes, dead rows first:
--   1. is_active = false, oldest last_seen_at first -- postings the crawl no
--      longer finds on the employer's board (filled, closed, expired). This
--      is genuinely free: nothing a search could return is lost.
--   2. Only if pass 1 doesn't clear the deficit, fall back to the oldest-seen
--      ACTIVE rows, exactly as before. This is real live-inventory loss and
--      now only happens when dead rows alone can't cover the budget.
--
-- Still not market-aware, per the same product decision the original function
-- recorded: every market stays, the budget decides what fits, dead rows first.
CREATE OR REPLACE FUNCTION public.evict_discovered_postings_over_budget(p_max_rows int)
RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  v_total int;
  v_deficit int;
  v_deleted_inactive int := 0;
  v_deleted_active int := 0;
BEGIN
  SELECT count(*) INTO v_total FROM public.discovered_postings;
  v_deficit := v_total - p_max_rows;
  IF v_deficit <= 0 THEN
    RETURN 0;
  END IF;

  WITH doomed AS (
    SELECT ctid
    FROM public.discovered_postings
    WHERE is_active = false
    ORDER BY last_seen_at ASC
    LIMIT v_deficit
  )
  DELETE FROM public.discovered_postings d
  USING doomed
  WHERE d.ctid = doomed.ctid;
  GET DIAGNOSTICS v_deleted_inactive = ROW_COUNT;

  v_deficit := v_deficit - v_deleted_inactive;

  IF v_deficit > 0 THEN
    WITH doomed AS (
      SELECT ctid
      FROM public.discovered_postings
      WHERE is_active = true
      ORDER BY last_seen_at ASC
      LIMIT v_deficit
    )
    DELETE FROM public.discovered_postings d
    USING doomed
    WHERE d.ctid = doomed.ctid;
    GET DIAGNOSTICS v_deleted_active = ROW_COUNT;
  END IF;

  RETURN v_deleted_inactive + v_deleted_active;
END;
$$;
