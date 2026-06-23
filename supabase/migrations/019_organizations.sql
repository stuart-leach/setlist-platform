-- 019 organizations: private org workspaces

-- ── New tables ───────────────────────────────────────────────────────────────

create table if not exists organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  logo_url   text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  org_id    uuid not null references organizations(id) on delete cascade,
  user_id   uuid not null references profiles(id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table if not exists organization_invites (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  token      text unique not null default encode(gen_random_bytes(16), 'hex'),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ── Scope channels to orgs ───────────────────────────────────────────────────
-- org_id null  → public community channel
-- org_id set   → private org channel (only visible to org members)
alter table channels add column if not exists org_id uuid references organizations(id) on delete cascade;

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table organizations      enable row level security;
alter table organization_members enable row level security;
alter table organization_invites enable row level security;

-- Organizations: readable by members + platform admins
create policy "orgs_select" on organizations for select using (
  id in (select org_id from organization_members where user_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "orgs_insert" on organizations for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "orgs_update" on organizations for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
create policy "orgs_delete" on organizations for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Members: visible to fellow members + platform admins
create policy "org_members_select" on organization_members for select using (
  org_id in (select org_id from organization_members where user_id = auth.uid())
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);
-- Any authenticated user can join (their own record only)
create policy "org_members_insert" on organization_members for insert with check (
  user_id = auth.uid()
);
-- Users can leave; platform admins can remove anyone
create policy "org_members_delete" on organization_members for delete using (
  user_id = auth.uid()
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Invites: any authenticated user can read (needed to validate token on join page)
create policy "invites_select" on organization_invites for select using (
  auth.uid() is not null
);
-- Platform admins and org owners/admins can create invite links
create policy "invites_insert" on organization_invites for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or org_id in (
    select org_id from organization_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  )
);
-- Platform admins and org owners/admins can revoke invite links
create policy "invites_delete" on organization_invites for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or org_id in (
    select org_id from organization_members
    where user_id = auth.uid() and role in ('owner', 'admin')
  )
);

-- ── Update channels RLS to handle org_id ────────────────────────────────────
-- Drop any existing select policies (names may vary across migration history)
drop policy if exists "channels_select"                    on channels;
drop policy if exists "Allow all read"                     on channels;
drop policy if exists "Anyone can view channels"           on channels;
drop policy if exists "Public channels are viewable"       on channels;
drop policy if exists "Enable read access for all users"   on channels;

-- Community channels (org_id null) are visible to all authenticated users.
-- Org channels are only visible to members of that org + platform admins.
create policy "channels_select" on channels for select using (
  org_id is null
  or org_id in (
    select org_id from organization_members where user_id = auth.uid()
  )
  or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
);

-- Drop and recreate insert/update/delete policies to also allow org owners/admins
drop policy if exists "channels_insert"       on channels;
drop policy if exists "admin_insert_channel"  on channels;
drop policy if exists "admin_create_channels" on channels;
create policy "channels_insert" on channels for insert with check (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or (
    org_id is not null
    and org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
);

drop policy if exists "channels_update"       on channels;
drop policy if exists "admin_update_channel"  on channels;
drop policy if exists "admin_edit_channels"   on channels;
create policy "channels_update" on channels for update using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or (
    org_id is not null
    and org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
);

drop policy if exists "channels_delete"       on channels;
drop policy if exists "admin_delete_channel"  on channels;
drop policy if exists "admin_delete_channels" on channels;
create policy "channels_delete" on channels for delete using (
  exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  or (
    org_id is not null
    and org_id in (
      select org_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  )
);
