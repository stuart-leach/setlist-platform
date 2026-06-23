-- DM message reactions
CREATE TABLE dm_message_reactions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id  UUID NOT NULL REFERENCES dm_messages(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (message_id, user_id, emoji)
);

ALTER TABLE dm_message_reactions ENABLE ROW LEVEL SECURITY;

-- Thread participants can view reactions
CREATE POLICY "Thread participants view DM reactions" ON dm_message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM dm_messages m
      JOIN dm_threads t ON t.id = m.thread_id
      WHERE m.id = dm_message_reactions.message_id
        AND (t.participant_a = auth.uid() OR t.participant_b = auth.uid())
    )
  );

-- Users can add their own reactions
CREATE POLICY "Users can add DM reactions" ON dm_message_reactions
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM dm_messages m
      JOIN dm_threads t ON t.id = m.thread_id
      WHERE m.id = message_id
        AND (t.participant_a = auth.uid() OR t.participant_b = auth.uid())
    )
  );

-- Users can remove their own reactions
CREATE POLICY "Users can remove DM reactions" ON dm_message_reactions
  FOR DELETE USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE dm_message_reactions;
