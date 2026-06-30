-- 029_per_org_moderation.sql
-- Make moderation tenant-specific: a ban/mute applies only within the org where
-- it was issued, and appeals belong to an org. Ban/mute state lives on the
-- membership row (organization_members); flagged messages are scoped via their
-- channel's org_id at query time (no schema change needed there).

alter table public.organization_members add column if not exists is_banned   boolean not null default false;
alter table public.organization_members add column if not exists muted_until  timestamptz;
alter table public.organization_members add column if not exists admin_note   text;

-- Appeals become per-org (a user can appeal separately in each org).
alter table public.ban_appeals add column if not exists org_id uuid references organizations(id) on delete cascade;

-- The old global UNIQUE(user_id) prevented more than one appeal per user; make it
-- per (user_id, org_id) instead.
alter table public.ban_appeals drop constraint if exists ban_appeals_user_id_key;
create unique index if not exists ban_appeals_user_org_key on public.ban_appeals (user_id, org_id);

-- Managers can read/resolve appeals for their org (server routes use the service
-- role, but allow manager reads for completeness).
drop policy if exists "appeals_manager_select" on public.ban_appeals;
create policy "appeals_manager_select" on public.ban_appeals for select
  using (org_id is not null and (is_org_manager(org_id) or is_platform_admin()));

drop policy if exists "appeals_manager_update" on public.ban_appeals;
create policy "appeals_manager_update" on public.ban_appeals for update
  using (org_id is not null and (is_org_manager(org_id) or is_platform_admin()));
