-- Phase 52, section 7 — Link Health history.
--
-- /admin/link-health was a point-in-time count with no history at all, so
-- "are apply links getting better or worse" was unanswerable: every page
-- load produced a number with nothing to compare it against. The original
-- 29%-mirror-links problem was only ever found because a user reported one
-- bad link by hand.
--
-- One row per (day, source). `source` is 'jobs' or 'discovered_postings' —
-- kept SEPARATE and never summed, because they measure different things:
-- `jobs` is the small per-user derived slice created by real searches,
-- while `discovered_postings` is the ~810k-row crawl cache that is now the
-- primary source users actually search. Blending them would let a healthy
-- 800-row table hide a sick 800,000-row one.
--
-- sample_size is stored alongside the counts and is NOT decorative: the
-- cache scan is sampled, not exhaustive, and a stored percentage whose
-- sample size was thrown away cannot be honestly compared to another.

CREATE TABLE IF NOT EXISTS public.link_health_snapshots (
  day DATE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('jobs', 'discovered_postings')),
  total INTEGER NOT NULL,
  sample_size INTEGER NOT NULL,
  direct INTEGER NOT NULL DEFAULT 0,
  board INTEGER NOT NULL DEFAULT 0,
  generic INTEGER NOT NULL DEFAULT 0,
  mirror INTEGER NOT NULL DEFAULT 0,
  unknown INTEGER NOT NULL DEFAULT 0,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (day, source)
);

-- Admin-only, same lockdown as every other admin_* table.
ALTER TABLE public.link_health_snapshots ENABLE ROW LEVEL SECURITY;
