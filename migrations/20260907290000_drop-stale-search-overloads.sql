-- Drop the stale overloads of search_postings_by_titles.
--
-- Search returned NOTHING. Cause: four overloads of this function existed at
-- once, because each change added a parameter via CREATE OR REPLACE, which
-- creates a NEW function rather than replacing the old one. PostgREST cannot
-- disambiguate same-named functions when called with a shared argument subset,
-- so every RPC call failed and the search fell through to nothing.
--
-- This exact trap is already documented in this repository, in
-- 20260903180000_fix-discovered-postings-location-filter.sql: "Dropped rather
-- than CREATE OR REPLACE: adding a parameter creates a second overload instead
-- of replacing, and PostgREST cannot disambiguate two functions of the same name
-- when called with the shared argument subset."
--
-- Any future signature change to this function must DROP the old signature
-- explicitly, in the same migration.
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], int, text);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], int, text, text);
DROP FUNCTION IF EXISTS public.search_postings_by_titles(text[], int, text, text, text[], text);
