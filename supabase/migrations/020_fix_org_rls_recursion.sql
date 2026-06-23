-- 020 fix infinite recursion in org RLS policies
--
-- Migration 019's policies on organization_members queried organization_members
-- inside their own USING clause, which Postgres rejects as infinite recursion.
-- Because channels_select also references organization_members, ALL channel
-- queries fail once 019 is applied — breaking channel pages with a 404.
--
-- Fix: move the membership lookups into SECURITY DEFINER functions, which run
-- with the owner's privileges and bypass RLS, so there's no recursion.

-- ── Helper functions ─────────────────────────────────────────────────────────

create or replace function is_org_member(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members
    where org_id = p_org_id and user_id = auth.uid()
  );
$$;

create or replace function is_org_manager(p_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from organization_members
    where org_id = p_org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

create or replace function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ── organizations ────────────────────────────────────────────────────────────
drop policy if exists "orgs_select" on organizations;
drop policy if exists "orgs_insert" on organizations;
drop policy if exists "orgs_update" on organizations;
drop policy if exists "orgs_delete" on organizations;

create policy "orgs_select" on organizations for select using (
  is_org_member(id) or is_platform_admin()
);
create policy "orgs_insert" on organizations for insert with check (is_platform_admin());
create policy "orgs_update" on organizations for update using (
  is_platform_admin() or is_org_manager(id)
);
create policy "orgs_delete" on organizations for delete using (is_platform_admin());

-- ── organization_members ─────────────────────────────────────────────────────
drop policy if exists "org_members_select" on organization_members;
drop policy if exists "org_members_insert" on organization_members;
drop policy if exists "org_members_delete" on organization_members;

-- A member can see their own rows + (via the SECURITY DEFINER fn) rows of orgs
-- they belong to. The function bypasses RLS, so no recursion.
create policy "org_members_select" on organization_members for select using (
  user_id = auth.uid() or is_org_member(org_id) or is_platform_admin()
);
create policy "org_members_insert" on organization_members for insert with check (
  user_id = auth.uid()
);
create policy "org_members_delete" on organization_members for delete using (
  user_id = auth.uid() or is_platform_admin() or is_org_manager(org_id)
);

-- ── organization_invites ─────────────────────────────────────────────────────
drop policy if exists "invites_select" on organization_invites;
drop policy if exists "invites_insert" on organization_invites;
drop policy if exists "invites_delete" on organization_invites;

create policy "invites_select" on organization_invites for select using (
  auth.uid() is not null
);
create policy "invites_insert" on organization_invites for insert with check (
  is_platform_admin() or is_org_manager(org_id)
);
create policy "invites_delete" on organization_invites for delete using (
  is_platform_admin() or is_org_manager(org_id)
);

-- ── channels ─────────────────────────────────────────────────────────────────
drop policy if exists "channels_select" on channels;
drop policy if exists "channels_insert" on channels;
drop policy if exists "channels_update" on channels;
drop policy if exists "channels_delete" on channels;

create policy "channels_select" on channels for select using (
  org_id is null or is_org_member(org_id) or is_platform_admin()
);
create policy "channels_insert" on channels for insert with check (
  is_platform_admin() or (org_id is not null and is_org_manager(org_id))
);
create policy "channels_update" on channels for update using (
  is_platform_admin() or (org_id is not null and is_org_manager(org_id))
);
create policy "channels_delete" on channels for delete using (
  is_platform_admin() or (org_id is not null and is_org_manager(org_id))
);
