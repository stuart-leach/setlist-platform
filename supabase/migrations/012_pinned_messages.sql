-- Add pinned_message_id to channels
ALTER TABLE channels
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Allow moderators and admins to update the pinned message
-- (Existing channel RLS policies cover SELECT; UPDATE needs a new policy)
CREATE POLICY "Mods can pin messages" ON channels
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('admin', 'moderator')
    )
  )
  WITH CHECK (true);
