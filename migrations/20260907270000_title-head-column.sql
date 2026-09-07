-- Match titles carrying a trailing qualifier.
--
-- Normalisation strips LEADING words ("Senior Financial Advisor" -> "financial
-- advisor") but not trailing ones, so real postings titled "Financial Advisor
-- CIRO", "Investment Advisor Associate" and "Financial Advisor Assistant" were
-- not matching their own occupation. Measured for Toronto financial advisors:
-- 86 rows matched, 15 more were these.
--
-- The head is the FIRST TWO WORDS, not a prefix wildcard. That distinction
-- matters: LIKE 'title %' also pulled "real estate showing agent" in on the
-- strength of "real estate", while a two-word head is "real estate", which is
-- not an occupation title and so matches nothing. Prefix matching added 29 rows
-- of which ~10 were wrong; this adds 15 of which none are.
--
-- Stored and indexed rather than computed per row: the same comparison as an
-- expression took 5,884ms against 104ms for the indexed equality.
ALTER TABLE public.discovered_postings ADD COLUMN IF NOT EXISTS normalized_title_head text;

CREATE OR REPLACE FUNCTION public.job_title_head(p_normalized text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(btrim(split_part(coalesce(p_normalized, ''), ' ', 1) || ' ' || split_part(coalesce(p_normalized, ''), ' ', 2)), '')
$$;

-- Maintained by the same trigger that keeps title_tsv and normalized_title in
-- step. Derived columns left to callers drift -- normalized_title did, within a
-- day of shipping.
CREATE OR REPLACE FUNCTION public.discovered_postings_title_tsv_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.title_tsv := to_tsvector('english', coalesce(NEW.title, ''));
  NEW.normalized_title := public.normalize_job_title(NEW.title);
  NEW.normalized_title_head := public.job_title_head(NEW.normalized_title);
  RETURN NEW;
END;
$$;

CREATE INDEX IF NOT EXISTS discovered_postings_title_head_idx
  ON public.discovered_postings (normalized_title_head) WHERE is_active;
