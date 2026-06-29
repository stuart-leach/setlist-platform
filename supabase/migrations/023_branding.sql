-- 023_branding.sql
-- Let each community brand the chat as their own church: a display name and a
-- logo shown in the sidebar header. Replaces the (now-removed) ability to
-- create new organizations.

ALTER TABLE public.community_settings ADD COLUMN IF NOT EXISTS community_name TEXT;
ALTER TABLE public.community_settings ADD COLUMN IF NOT EXISTS logo_url       TEXT;

-- Public bucket for the community logo.
INSERT INTO storage.buckets (id, name, public)
VALUES ('branding', 'branding', TRUE)
ON CONFLICT (id) DO NOTHING;

-- Anyone can view the logo (it's shown to every member).
DROP POLICY IF EXISTS "branding_public_read" ON storage.objects;
CREATE POLICY "branding_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'branding');

-- Only admins can upload, replace, or remove the logo.
DROP POLICY IF EXISTS "branding_admin_write" ON storage.objects;
CREATE POLICY "branding_admin_write" ON storage.objects
  FOR ALL
  USING      (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (bucket_id = 'branding' AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
