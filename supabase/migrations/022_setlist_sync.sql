-- 022_setlist_sync.sql
-- Support auto-generating setlist chats from the MultiTracks Playback API.
-- Each synced channel maps back to its MultiTracks setlist so re-syncing
-- updates the existing chat instead of creating duplicates.

ALTER TABLE channels ADD COLUMN IF NOT EXISTS mt_setlist_id   BIGINT;
ALTER TABLE channels ADD COLUMN IF NOT EXISTS mt_setlist_date TIMESTAMPTZ;

-- One channel per MultiTracks setlist (manual setlist chats leave this NULL).
CREATE UNIQUE INDEX IF NOT EXISTS channels_mt_setlist_id_key
  ON channels (mt_setlist_id)
  WHERE mt_setlist_id IS NOT NULL;

-- Record when the last successful sync ran (shown in the Admin Hub).
ALTER TABLE public.community_settings
  ADD COLUMN IF NOT EXISTS setlists_last_synced_at TIMESTAMPTZ;
