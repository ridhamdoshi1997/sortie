-- Structural analysis of 25 real scraped job descriptions found a
-- recurring, genuinely useful category not captured by any existing
-- field: hiring/application process detail (interview steps, timeline,
-- format) — e.g. Acuity Insights' full "Application Review -> Intro Chat
-- -> Technical Deep Dive -> Team Conversations -> Decision" pipeline,
-- SPECTRAFORCE's "1 step, in person or virtual, 1 hour". Distinct from
-- Requirements/Benefits, and common enough across the real sample to
-- deserve its own column rather than being lost or awkwardly folded into
-- about_role. Same array-of-bullet-phrases shape as responsibilities/
-- benefits, hidden on the UI when empty (most postings still won't have
-- one — not fabricated, only shown when the posting actually states it).
ALTER TABLE public.jobs
  ADD COLUMN hiring_process text[] DEFAULT '{}'::text[];
