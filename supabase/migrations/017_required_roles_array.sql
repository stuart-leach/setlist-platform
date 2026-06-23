-- 017_required_roles_array.sql
-- Change required_role from TEXT to TEXT[] so a channel can require
-- any one of multiple community roles (e.g. worship_leader OR band_member).

-- Drop the old single-value CHECK constraint (auto-named by Postgres)
ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_required_role_check;

-- Convert column type TEXT → TEXT[], wrapping existing single values in an array
ALTER TABLE channels
  ALTER COLUMN required_role TYPE TEXT[]
  USING CASE
    WHEN required_role IS NULL THEN NULL
    ELSE ARRAY[required_role]
  END;
