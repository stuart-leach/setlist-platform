-- Allow authenticated users to insert their own profile row.
-- Needed so AnonymousAuthProvider can upsert a profile for users
-- whose profile was never created by the trigger (e.g. old anonymous sessions).
create policy "profiles_insert" on public.profiles for insert to authenticated
  with check (auth.uid() = id);
