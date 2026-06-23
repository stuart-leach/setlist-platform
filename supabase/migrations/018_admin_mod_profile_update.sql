-- 018_admin_mod_profile_update.sql
-- The existing "profiles_update" policy only lets users edit their own row.
-- Admins need to update any profile (role, muted_until, is_banned, admin_note).
-- Moderators need to update muted_until and is_banned on non-admin profiles.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'admins_update_any_profile'
  ) THEN
    CREATE POLICY "admins_update_any_profile" ON profiles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM profiles AS p
          WHERE p.id = auth.uid() AND p.role = 'admin'
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'mods_update_profiles'
  ) THEN
    -- Mods can mute/ban regular members and other mods, but not admins
    CREATE POLICY "mods_update_profiles" ON profiles
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM profiles AS p
          WHERE p.id = auth.uid() AND p.role = 'moderator'
        )
        AND role IN ('member', 'moderator')
      );
  END IF;
END $$;
