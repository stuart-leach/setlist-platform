-- Enable realtime for thread replies so ThreadView live-updates without a refresh
ALTER PUBLICATION supabase_realtime ADD TABLE message_replies;
