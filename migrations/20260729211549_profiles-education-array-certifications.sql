-- education moves from a single-object column to an array, so profiles with
-- multiple degrees (common on real LinkedIn exports) don't silently lose all
-- but one on import. certifications is new (previously dropped entirely).
UPDATE profiles
SET education = CASE
  WHEN education IS NULL OR education = '{}'::jsonb THEN '[]'::jsonb
  WHEN jsonb_typeof(education) = 'object' THEN jsonb_build_array(education)
  ELSE education
END
WHERE jsonb_typeof(education) = 'object';

ALTER TABLE profiles ALTER COLUMN education SET DEFAULT '[]'::jsonb;

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS certifications text[] DEFAULT '{}'::text[];
