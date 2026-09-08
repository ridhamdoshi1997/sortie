-- Fire the paid providers on DEMAND with a per-query freshness window, rather
-- than on how thin the index looks.
--
-- The old gate was `index returned >= 25 relevant jobs -> skip LinkedIn and
-- Indeed`. That optimises for cost and gets freshness wrong in both directions:
-- a query the index answers well is never refreshed even when its provider data
-- is weeks old, and a query the index answers poorly re-fires the providers on
-- every single search, paying repeatedly for the same answer within minutes.
--
-- The rule this replaces it with (direct product decision, 2026-09-08): fire
-- when a search arrives and this same query has not been fetched in the last 24
-- hours. Nothing fires on a schedule -- a query nobody searches costs nothing,
-- and a query someone does search is never more than a day stale. Cost then
-- scales with real demand instead of with a maintained list.
--
-- Measured cost per fire: $0.0100 LinkedIn + $0.0058 Indeed = $0.016 a pair, so
-- ~$0.48/month per query that is searched daily. The $5 free credit covers
-- about ten distinct queries a day.

CREATE TABLE IF NOT EXISTS public.provider_query_fetches (
  query_key       text PRIMARY KEY,
  title           text NOT NULL,
  location        text NOT NULL,
  last_fetched_at timestamptz NOT NULL DEFAULT now(),
  fetch_count     int NOT NULL DEFAULT 1
);

COMMENT ON TABLE public.provider_query_fetches IS
  'One row per distinct search query, recording when LinkedIn/Indeed were last fetched for it. Drives the 24h demand-driven refresh.';

-- Claim-or-skip, deliberately ONE statement.
--
-- Checking freshness and then recording it as two round trips is a race: several
-- identical searches arriving together would all read a stale timestamp and all
-- fire, paying N times for one refresh. The conditional upsert decides and
-- records atomically -- exactly one caller gets a row back, everyone else is
-- told to skip.
--
-- Returns TRUE when the caller should fetch. Claims on INITIATION rather than on
-- success, so a burst cannot stampede; a genuinely failed fetch simply waits for
-- the window to lapse rather than retrying at cost.
CREATE OR REPLACE FUNCTION public.claim_paid_source_fetch(
  p_title      text,
  p_location   text,
  p_ttl_hours  numeric DEFAULT 24
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_key     text;
  v_claimed text;
BEGIN
  -- Same normalisation as the search path, so "Financial Advisor"/"Toronto, ON"
  -- and " financial advisor "/"toronto, on" are one query, not two.
  v_key := lower(btrim(coalesce(p_title, ''))) || '|' || lower(btrim(coalesce(p_location, '')));
  IF v_key = '|' THEN
    RETURN false;
  END IF;

  INSERT INTO public.provider_query_fetches AS f (query_key, title, location, last_fetched_at, fetch_count)
  VALUES (v_key, coalesce(p_title, ''), coalesce(p_location, ''), now(), 1)
  ON CONFLICT (query_key) DO UPDATE
    SET last_fetched_at = now(),
        fetch_count     = f.fetch_count + 1
    WHERE f.last_fetched_at < now() - make_interval(secs => p_ttl_hours * 3600)
  RETURNING query_key INTO v_claimed;

  RETURN v_claimed IS NOT NULL;
END;
$$;

-- Read-only companion for logging and for the admin view: how stale is a query
-- without claiming it.
CREATE OR REPLACE FUNCTION public.paid_source_fetch_age_hours(
  p_title    text,
  p_location text
)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT round(extract(epoch FROM now() - f.last_fetched_at) / 3600.0, 2)
  FROM public.provider_query_fetches f
  WHERE f.query_key = lower(btrim(coalesce(p_title, ''))) || '|' || lower(btrim(coalesce(p_location, '')));
$$;
