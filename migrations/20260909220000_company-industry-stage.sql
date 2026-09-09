-- Industry and company stage, learned from the AI call we already make.
--
-- A competitor filters on both. We could not, because nothing in the pipeline
-- records them: measured across 722 live jobs, exactly ONE had any company
-- research attached. Shipping those filters against that data would have put
-- controls on screen that empty the list whatever the postings say -- the same
-- failure the visa filter had.
--
-- They come free. Both AI passes already read the whole posting and already
-- return companyDomain; industry and stage are two more short strings from a
-- call that has been made and paid for either way.
--
-- Stored per COMPANY rather than per job, beside the domain, because that is
-- what they are. One MNP posting teaches us MNP's industry and every other MNP
-- posting benefits, for every user.
ALTER TABLE public.company_domains
  ADD COLUMN IF NOT EXISTS industry text,
  ADD COLUMN IF NOT EXISTS company_stage text;

COMMENT ON COLUMN public.company_domains.industry IS
  'Broad sector, e.g. "Financial Services", "Software". From the AI extraction pass.';
COMMENT ON COLUMN public.company_domains.company_stage IS
  'One of: early, growth, late, public, nonprofit, government. From the AI extraction pass.';
