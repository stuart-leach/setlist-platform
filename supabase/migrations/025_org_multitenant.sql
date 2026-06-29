-- 025_org_multitenant.sql
-- Additive schema changes to turn the app multi-tenant. Safe to deploy before any
-- app changes: the community path (org_id IS NULL) keeps working throughout.
--
-- RLS rule: only ever use the SECURITY DEFINER helpers is_org_member /
-- is_org_manager / is_platform_admin (migration 020) inside policies — never an
-- inline subquery on organization_members (that caused the 019 recursion bug).

-- ── 1. Self-serve org creation ────────────────────────────────────────────────
-- Any authenticated user may create an organization (was platform-admin only).
drop policy if exists "orgs_insert" on organizations;
create policy "orgs_insert" on organizations for insert with check (auth.uid() is not null);

-- Managers can change member roles within their org (020 had no UPDATE policy).
drop policy if exists "org_members_update" on organization_members;
create policy "org_members_update" on organization_members for update
  using      (is_org_manager(org_id))
  with check (is_org_manager(org_id));

-- Owner-only helper (mirrors is_org_manager) for future owner-gated actions.
create or replace function is_org_owner(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members
    where org_id = p_org_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ── 2. Per-org settings ───────────────────────────────────────────────────────
create table if not exists public.org_settings (
  org_id                  uuid primary key references organizations(id) on delete cascade,
  role_channels_enabled   boolean not null default true,
  setlists_last_synced_at timestamptz,
  updated_at              timestamptz not null default now()
);

alter table public.org_settings enable row level security;

drop policy if exists "org_settings_select" on public.org_settings;
create policy "org_settings_select" on public.org_settings for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "org_settings_write" on public.org_settings;
create policy "org_settings_write" on public.org_settings for all
  using      (is_org_manager(org_id) or is_platform_admin())
  with check (is_org_manager(org_id) or is_platform_admin());

-- ── 3. Atomic org creation (org + owner membership + settings) ────────────────
-- Avoids an owner-less window / race from doing the inserts client-side.
create or replace function create_organization(p_name text, p_slug text)
returns organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org organizations;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into organizations (name, slug, created_by)
  values (p_name, p_slug, auth.uid())
  returning * into v_org;

  insert into organization_members (org_id, user_id, role)
  values (v_org.id, auth.uid(), 'owner');

  insert into org_settings (org_id) values (v_org.id);

  return v_org;
end;
$$;

grant execute on function create_organization(text, text) to authenticated;

-- ── 4. Per-org MultiTracks connection ─────────────────────────────────────────
-- Add org_id now (nullable); the singleton row is moved to the community org in
-- migration 026, and the PK is reshaped to org_id afterwards in migration 027.
alter table public.mt_connection
  add column if not exists org_id uuid references organizations(id) on delete cascade;

-- One connection per org once populated.
create unique index if not exists mt_connection_org_id_key
  on public.mt_connection (org_id) where org_id is not null;

-- ── 5. Per-org setlist uniqueness ─────────────────────────────────────────────
-- A MultiTracks setlist id is only unique WITHIN an org now (two orgs can sync
-- the same upstream setlist id into their own chats).
drop index if exists channels_mt_setlist_id_key;
create unique index if not exists channels_org_mt_setlist_id_key
  on public.channels (org_id, mt_setlist_id) where mt_setlist_id is not null;

-- ── 6. Branding bucket: allow org owners (not just platform admins) to upload ──
-- Logos are public-read and low-risk; allow any authenticated user to write.
drop policy if exists "branding_admin_write" on storage.objects;
create policy "branding_authed_write" on storage.objects
  for all
  using      (bucket_id = 'branding' and auth.uid() is not null)
  with check (bucket_id = 'branding' and auth.uid() is not null);
