-- 024_mt_connection.sql
-- Store the community's MultiTracks connection in-app (set via Admin Hub),
-- replacing the MT_USERNAME / MT_PASSWORD environment variables.
--
-- We persist the long-lived session token (AES-GCM encrypted by the app) plus
-- the customer/user IDs needed for API calls — never the raw password.

CREATE TABLE IF NOT EXISTS public.mt_connection (
  id              BOOLEAN PRIMARY KEY DEFAULT TRUE,
  session_hash    TEXT,           -- encrypted MultiTracks session token
  customer_id     BIGINT,
  user_access_id  BIGINT,
  connected_email TEXT,           -- shown in the UI ("Connected as …")
  connected_at    TIMESTAMPTZ,
  last_error      TEXT,
  CONSTRAINT mt_connection_singleton CHECK (id)
);

INSERT INTO public.mt_connection (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- Lock it down: no client (anon/authenticated) access at all. Only the service
-- role — used by the server API routes — can read or write it. With RLS enabled
-- and no policies, every client request is denied by default; the service role
-- bypasses RLS.
ALTER TABLE public.mt_connection ENABLE ROW LEVEL SECURITY;
