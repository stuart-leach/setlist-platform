-- Enable realtime for message_reactions so clients can subscribe to changes.
-- Without this, postgres_changes subscriptions on this table are silently ignored
-- by Supabase, which can destabilise the shared realtime socket and break all
-- other subscriptions (including live message delivery).
alter publication supabase_realtime add table message_reactions;
