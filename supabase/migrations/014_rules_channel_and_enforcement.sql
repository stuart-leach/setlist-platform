-- Add locked flag to channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Create #rules channel (locked, no required_role so everyone can see it)
INSERT INTO channels (slug, name, description, required_role, locked)
VALUES ('rules', 'Rules', 'Community rules and guidelines', NULL, TRUE)
ON CONFLICT (slug) DO UPDATE SET locked = TRUE, name = 'Rules', description = 'Community rules and guidelines';

-- ── Restrictive policies: AND-ed with existing permissive ones ────────────────

-- Block muted and banned users from sending messages
CREATE POLICY "block_muted_banned_messages" ON messages
  AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (
          p.is_banned = TRUE
          OR (p.muted_until IS NOT NULL AND p.muted_until > now())
        )
    )
  );

-- Locked channels: only admins can post
CREATE POLICY "locked_channels_admin_only" ON messages
  AS RESTRICTIVE
  FOR INSERT WITH CHECK (
    -- Either the channel is not locked…
    NOT EXISTS (SELECT 1 FROM channels c WHERE c.id = channel_id AND c.locked = TRUE)
    -- …or the poster is an admin
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
