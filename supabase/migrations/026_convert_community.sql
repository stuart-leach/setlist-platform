-- 026_convert_community.sql
-- ONE-TIME, IRREVERSIBLE data migration: turn the existing single community into
-- a real organization owned by the platform admin (Stuart), with every existing
-- user auto-enrolled as a member. Take a database snapshot before running.
--
-- Run AFTER migration 025 and after the Phase-2 app code is deployed.
-- Safe to re-run (guards against duplicates).

do $$
declare
  v_admin uuid;
  v_org   uuid;
  v_cs    public.community_settings%rowtype;
begin
  -- Owner = earliest-created platform admin. Fail loudly if there isn't one.
  select id into v_admin from public.profiles where role = 'admin' order by created_at asc limit 1;
  if v_admin is null then
    raise exception 'No admin profile found to own the community org';
  end if;

  select * into v_cs from public.community_settings limit 1;

  -- Create (or reuse) the "community" org from the existing branding.
  select id into v_org from public.organizations where slug = 'community';
  if v_org is null then
    insert into public.organizations (name, slug, logo_url, created_by)
    values (coalesce(nullif(v_cs.community_name, ''), 'My Community'), 'community', v_cs.logo_url, v_admin)
    returning id into v_org;
  end if;

  -- Admin becomes owner.
  insert into public.organization_members (org_id, user_id, role)
  values (v_org, v_admin, 'owner')
  on conflict (org_id, user_id) do update set role = 'owner';

  -- Auto-enroll every other existing user as a member so nobody loses access.
  insert into public.organization_members (org_id, user_id, role)
  select v_org, id, 'member' from public.profiles where id <> v_admin
  on conflict (org_id, user_id) do nothing;

  -- Move all community channels (org_id IS NULL) into the org, including #rules (system).
  update public.channels set org_id = v_org where org_id is null;

  -- Carry over per-community settings.
  insert into public.org_settings (org_id, role_channels_enabled, setlists_last_synced_at)
  values (v_org, coalesce(v_cs.role_channels_enabled, true), v_cs.setlists_last_synced_at)
  on conflict (org_id) do update
    set role_channels_enabled  = excluded.role_channels_enabled,
        setlists_last_synced_at = excluded.setlists_last_synced_at;

  -- Move the (singleton) MultiTracks connection row to this org.
  update public.mt_connection set org_id = v_org where org_id is null;

  raise notice 'Community converted into org % (owner %).', v_org, v_admin;
end $$;
