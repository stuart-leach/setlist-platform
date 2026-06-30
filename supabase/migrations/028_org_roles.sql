-- 028_org_roles.sql
-- Per-org roles: a managed set of roles per organization, plus which members
-- hold each role. Role channels (channels.channel_type='role') store the role
-- keys in channels.required_role and are shown to members who hold a matching role.

-- Role definitions for an org (e.g. key 'worship-leaders', label 'Worship Leaders').
create table if not exists public.org_roles (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  key        text not null,
  label      text not null,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);
alter table public.org_roles enable row level security;

drop policy if exists "org_roles_select" on public.org_roles;
create policy "org_roles_select" on public.org_roles for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "org_roles_write" on public.org_roles;
create policy "org_roles_write" on public.org_roles for all
  using      (is_org_manager(org_id) or is_platform_admin())
  with check (is_org_manager(org_id) or is_platform_admin());

-- Which members hold which role within an org.
create table if not exists public.org_member_roles (
  org_id   uuid not null references organizations(id) on delete cascade,
  user_id  uuid not null references profiles(id) on delete cascade,
  role_key text not null,
  primary key (org_id, user_id, role_key)
);
alter table public.org_member_roles enable row level security;

drop policy if exists "omr_select" on public.org_member_roles;
create policy "omr_select" on public.org_member_roles for select
  using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "omr_write" on public.org_member_roles;
create policy "omr_write" on public.org_member_roles for all
  using      (is_org_manager(org_id) or is_platform_admin())
  with check (is_org_manager(org_id) or is_platform_admin());
