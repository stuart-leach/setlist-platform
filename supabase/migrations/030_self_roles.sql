-- 030_self_roles.sql
-- Unify roles on the per-org system. Members may self-select their own roles
-- from their profile (in addition to managers assigning them in the Admin Hub),
-- so allow a user to manage their OWN org_member_roles rows in orgs they belong to.
-- (028's omr_write covers managers; this adds self-service for the owner of the row.)

drop policy if exists "omr_self" on public.org_member_roles;
create policy "omr_self" on public.org_member_roles for all
  using      (user_id = auth.uid() and is_org_member(org_id))
  with check (user_id = auth.uid() and is_org_member(org_id));
