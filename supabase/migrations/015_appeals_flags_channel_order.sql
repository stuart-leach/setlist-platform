-- Ban appeals (one per banned user)
CREATE TABLE IF NOT EXISTS ban_appeals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL UNIQUE,
  content TEXT NOT NULL CHECK (char_length(content) <= 1000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE ban_appeals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_view_own_appeal" ON ban_appeals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_appeal" ON ban_appeals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "admins_manage_appeals" ON ban_appeals FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Message flags (users report messages; admins review)
CREATE TABLE IF NOT EXISTS message_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE NOT NULL,
  flagged_by UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE (message_id, flagged_by)
);
ALTER TABLE message_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_can_flag" ON message_flags FOR INSERT WITH CHECK (auth.uid() = flagged_by);
CREATE POLICY "users_view_own_flags" ON message_flags FOR SELECT USING (auth.uid() = flagged_by);
CREATE POLICY "admins_manage_flags" ON message_flags FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Personal channel order
CREATE TABLE IF NOT EXISTS user_channel_order (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  general_order TEXT[] NOT NULL DEFAULT '{}',
  role_order TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
ALTER TABLE user_channel_order ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_manage_own_order" ON user_channel_order FOR ALL USING (auth.uid() = user_id);

-- Note: no extra profiles SELECT policy needed.
-- The existing "profiles_select" policy (using (true) for authenticated) already
-- allows admins to read all profiles. Adding a self-referential policy on profiles
-- causes infinite recursion and must be avoided.
