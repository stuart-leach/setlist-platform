-- Reactions on thread replies
CREATE TABLE IF NOT EXISTS reply_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reply_id   UUID NOT NULL REFERENCES message_replies(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(reply_id, user_id, emoji)
);

ALTER TABLE reply_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_reply_reactions"        ON reply_reactions FOR SELECT USING (true);
CREATE POLICY "manage_own_reply_reactions"  ON reply_reactions FOR ALL USING (auth.uid() = user_id);

-- Add to realtime publication so live reaction sync works
ALTER PUBLICATION supabase_realtime ADD TABLE reply_reactions;
