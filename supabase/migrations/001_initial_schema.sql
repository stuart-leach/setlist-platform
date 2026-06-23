-- ─────────────────────────────────────────────────────────────
-- Community Platform — Initial Schema
-- Run this in your Supabase SQL Editor or via `supabase db push`
-- ─────────────────────────────────────────────────────────────

-- ── Profiles ──────────────────────────────────────────────────
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text unique not null,
  display_name text,
  avatar_url   text,
  intercom_id  text,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user is created
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Channels ──────────────────────────────────────────────────
create table if not exists public.channels (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- Seed default channels
insert into public.channels (slug, name, description) values
  ('general',       'General',       'General discussion'),
  ('announcements', 'Announcements', 'Product updates and news'),
  ('playback',      'Playback',      'Discussion about the Playback feature'),
  ('chart-builder', 'Chart Builder', 'Tips and questions for Chart Builder'),
  ('help',          'Help & Support','Get help from the community')
on conflict (slug) do nothing;

-- ── Channel Messages ──────────────────────────────────────────
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  content    text not null check (char_length(content) > 0 and char_length(content) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_created_idx on public.messages (channel_id, created_at desc);

-- ── Direct Message Threads ─────────────────────────────────────
create table if not exists public.dm_threads (
  id            uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.profiles(id) on delete cascade,
  participant_b uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz not null default now(),
  -- enforce consistent ordering so (A,B) and (B,A) map to same row
  constraint dm_threads_ordered check (participant_a < participant_b),
  unique(participant_a, participant_b)
);

create table if not exists public.dm_messages (
  id        uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content   text not null check (char_length(content) > 0 and char_length(content) <= 4000),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_created_idx on public.dm_messages (thread_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Row-Level Security
-- ─────────────────────────────────────────────────────────────

alter table public.profiles    enable row level security;
alter table public.channels    enable row level security;
alter table public.messages    enable row level security;
alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;

-- Profiles: anyone authenticated can read; users can update only their own
create policy "profiles_select" on public.profiles for select to authenticated using (true);
create policy "profiles_update" on public.profiles for update to authenticated using (auth.uid() = id);

-- Channels: readable by all authenticated users (read-only; managed via SQL/admin)
create policy "channels_select" on public.channels for select to authenticated using (true);

-- Messages: readable by all authenticated; insertable only as yourself
create policy "messages_select" on public.messages for select to authenticated using (true);
create policy "messages_insert" on public.messages for insert to authenticated
  with check (auth.uid() = user_id);
create policy "messages_delete" on public.messages for delete to authenticated
  using (auth.uid() = user_id);

-- DM threads: visible only to participants
create policy "dm_threads_select" on public.dm_threads for select to authenticated
  using (auth.uid() = participant_a or auth.uid() = participant_b);
create policy "dm_threads_insert" on public.dm_threads for insert to authenticated
  with check (auth.uid() = participant_a or auth.uid() = participant_b);

-- DM messages: visible only to thread participants
create policy "dm_messages_select" on public.dm_messages for select to authenticated
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = thread_id
        and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
    )
  );
create policy "dm_messages_insert" on public.dm_messages for insert to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.dm_threads t
      where t.id = thread_id
        and (t.participant_a = auth.uid() or t.participant_b = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────
-- Realtime
-- Enable realtime on messages and dm_messages in the Supabase
-- dashboard: Database → Replication → toggle these tables on.
-- Or run:
--   alter publication supabase_realtime add table public.messages;
--   alter publication supabase_realtime add table public.dm_messages;
-- ─────────────────────────────────────────────────────────────
