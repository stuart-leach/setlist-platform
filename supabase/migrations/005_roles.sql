-- Platform role on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
  CHECK (role IN ('admin', 'moderator', 'member'));

-- Moderation fields
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS muted_until TIMESTAMPTZ;

-- Community roles
CREATE TABLE IF NOT EXISTS community_roles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('worship_leader','band_member','vocalist','music_director','production_director')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE community_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_community_roles" ON community_roles FOR SELECT USING (true);
CREATE POLICY "manage_own_community_roles" ON community_roles FOR ALL USING (auth.uid() = user_id);

-- Required role on channels
ALTER TABLE channels ADD COLUMN IF NOT EXISTS required_role TEXT
  CHECK (required_role IN ('worship_leader','band_member','vocalist','music_director','production_director'));

-- Insert role-gated channels
INSERT INTO channels (slug, name, description, required_role) VALUES
  ('worship-leaders',      'Worship Leaders',      'For worship leaders',         'worship_leader'),
  ('band-members',         'Band Members',          'For band members',            'band_member'),
  ('vocalists',            'Vocalists',             'For vocalists and singers',   'vocalist'),
  ('music-directors',      'Music Directors',       'For music directors',         'music_director'),
  ('production-directors', 'Production Directors',  'For production directors',    'production_director')
ON CONFLICT (slug) DO NOTHING;
