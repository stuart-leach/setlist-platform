-- 021_setlists_and_role_channel_toggle.sql
-- Sidebar redesign: introduce a channel_type so the sidebar can split channels
-- into four sections (General, Setlists, Role Channels, Direct Messages), and a
-- community_settings table so admins can disable role channels entirely.

-- ── channel_type ─────────────────────────────────────────────────────────────
-- 'general'  → top section (general chat + announcements)
-- 'setlist'  → per-setlist chats, created by admins/mods
-- 'role'     → role-restricted channels (required_role IS NOT NULL)
-- 'system'   → special channels kept out of the sidebar (e.g. #rules)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'general';

ALTER TABLE channels DROP CONSTRAINT IF EXISTS channels_channel_type_check;
ALTER TABLE channels ADD CONSTRAINT channels_channel_type_check
  CHECK (channel_type IN ('general', 'setlist', 'role', 'system'));

-- Classify existing rows.
UPDATE channels SET channel_type = 'role'   WHERE required_role IS NOT NULL;
UPDATE channels SET channel_type = 'system' WHERE slug = 'rules';

-- Remove the legacy general channels we no longer want in the redesign.
-- (general + announcements stay; #rules stays as 'system' for the mute link.)
DELETE FROM channels WHERE slug IN ('playback', 'chart-builder', 'help');

-- ── community_settings (single-row) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_settings (
  id                     BOOLEAN PRIMARY KEY DEFAULT TRUE,
  role_channels_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT community_settings_singleton CHECK (id)
);

INSERT INTO public.community_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.community_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (the sidebar needs them on every page).
DROP POLICY IF EXISTS "community_settings_read" ON public.community_settings;
CREATE POLICY "community_settings_read" ON public.community_settings
  FOR SELECT USING (TRUE);

-- Only admins can change them.
DROP POLICY IF EXISTS "community_settings_admin_update" ON public.community_settings;
CREATE POLICY "community_settings_admin_update" ON public.community_settings
  FOR UPDATE
  USING      (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
