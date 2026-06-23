CREATE TABLE IF NOT EXISTS message_replies (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id      UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES profiles(id),
  content        TEXT NOT NULL,
  attachment_url TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE message_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_message_replies"
  ON message_replies FOR SELECT USING (true);

CREATE POLICY "insert_message_replies"
  ON message_replies FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "delete_message_replies"
  ON message_replies FOR DELETE
  USING (auth.uid() = user_id);
