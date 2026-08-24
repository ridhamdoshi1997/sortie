-- §Q4a STAR Vault surfacing — optional provenance link from a STAR story to
-- the specific interview_events row it was used for (or written in response
-- to). Nullable: most stories will never be linked, this is opt-in
-- annotation, not a required field. Mirrors star_stories.accomplishment_id's
-- existing nullable-provenance pattern exactly.
ALTER TABLE public.star_stories
  ADD COLUMN interview_event_id uuid REFERENCES public.interview_events(id) ON DELETE SET NULL;
