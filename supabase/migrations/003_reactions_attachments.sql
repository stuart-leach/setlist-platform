-- Migration 003: emoji reactions + message attachment support

-- Attachment URL on channel messages
alter table public.messages
  add column if not exists attachment_url text;

-- Attachment URL on DM messages
alter table public.dm_messages
  add column if not exists attachment_url text;

-- Emoji reactions on channel messages
create table if not exists public.message_reactions (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  emoji        text not null,
  created_at   timestamptz default now(),
  unique (message_id, user_id, emoji)
);

alter table public.message_reactions enable row level security;

create policy "reactions_select"
  on public.message_reactions for select
  to authenticated using (true);

create policy "reactions_insert"
  on public.message_reactions for insert
  to authenticated with check (auth.uid() = user_id);

create policy "reactions_delete"
  on public.message_reactions for delete
  to authenticated using (auth.uid() = user_id);
