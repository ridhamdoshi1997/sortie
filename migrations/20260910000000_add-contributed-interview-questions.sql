-- Real interview questions, contributed by real candidates — the second
-- source for the Interview Prep hub, alongside the existing AI-generated
-- interview_question_banks (per-user, on-demand, lib/interviewSeo.ts).
--
-- Deliberately a SEPARATE table rather than folding into
-- interview_question_banks: that table's `questions` jsonb column holds
-- AI-generated {category, question, rationale} triples for one specific
-- role_family+seniority, keyed for the programmatic SEO pages. A candidate
-- reporting "this is the actual question Google asked me" isn't a rationale-
-- bearing category triple, it's one real, dated, attributed data point —
-- mixing the two shapes into one jsonb blob would blur AI-authored content
-- with human-submitted content, which `context/ui-tokens.md`'s own
-- Invariants section treats as a hard line (agent-teal is reserved
-- EXCLUSIVELY for AI-generated content; this table's rows must never render
-- with that treatment).
--
-- company_key mirrors lib/atsRegistry.ts's toCompanyKey() so a contributed
-- row can be grouped against the same company identity the job-search side
-- already uses, without a live join across projects (this table lives in
-- the MAIN project; discovered_postings/company_domains live in the cache
-- project) — the key is computed in application code from the same
-- function and stored alongside the free-text company name.
CREATE TABLE public.contributed_interview_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company text NOT NULL,
  company_key text NOT NULL,
  role text NOT NULL,
  interview_date date,
  question text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX contributed_interview_questions_company_key_idx
  ON public.contributed_interview_questions (company_key);
CREATE INDEX contributed_interview_questions_created_at_idx
  ON public.contributed_interview_questions (created_at DESC);

ALTER TABLE public.contributed_interview_questions ENABLE ROW LEVEL SECURITY;

-- No public SELECT policy, by design — mirrors interview_question_banks
-- (see lib/interviewSeo.ts's own comment on this exact choice). The hub
-- page is public/unauthenticated marketing content, read server-side via
-- the admin client, same as the AI-generated banks; RLS here only needs to
-- gate WRITES.
CREATE POLICY contributed_interview_questions_insert_own
  ON public.contributed_interview_questions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY contributed_interview_questions_select_own
  ON public.contributed_interview_questions
  FOR SELECT USING (auth.uid() = user_id);

-- No UPDATE/DELETE policy yet, and no moderation status column — a real,
-- deliberate gap, not an oversight. v1 auto-publishes on submit (the
-- modal's own copy asks contributors not to include personal info, same
-- disclaimer this pattern uses elsewhere). Add a status column + admin
-- review queue the moment this needs moderating, rather than building an
-- unused one now.
