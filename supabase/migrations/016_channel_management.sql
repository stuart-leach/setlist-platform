-- 016_channel_management.sql
-- Allow admins to create and delete channels.
-- (UPDATE is already permitted by the existing policy used for pinned messages.)

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'admins_insert_channels'
  ) THEN
    CREATE POLICY "admins_insert_channels" ON channels
      FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'channels' AND policyname = 'admins_delete_channels'
  ) THEN
    CREATE POLICY "admins_delete_channels" ON channels
      FOR DELETE
      USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
      );
  END IF;
END $$;

-- Cascade-delete messages when a channel is deleted so we don't leave orphans.
-- Only adds the constraint if it doesn't already exist.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'messages_channel_id_cascade'
  ) THEN
    -- Drop the existing FK if present, then re-add with CASCADE
    ALTER TABLE messages
      DROP CONSTRAINT IF EXISTS messages_channel_id_fkey;
    ALTER TABLE messages
      ADD CONSTRAINT messages_channel_id_fkey
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE;
  END IF;
END $$;
