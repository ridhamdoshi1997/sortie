ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS application_status_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_diagnosis jsonb,
  ADD COLUMN IF NOT EXISTS rejection_diagnosed_at timestamptz;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_application_status_check
  CHECK (application_status IN ('draft', 'applied', 'interviewing', 'offered', 'rejected'));
