ALTER TABLE jobs ADD COLUMN IF NOT EXISTS application_status text NOT NULL DEFAULT 'draft';
