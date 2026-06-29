-- 027_mt_connection_pk.sql
-- Finish the mt_connection reshape: key it by org_id (one connection per org)
-- and drop the old boolean singleton. Run AFTER 026 populated org_id.

-- Remove any leftover row that was never tied to an org.
delete from public.mt_connection where org_id is null;

alter table public.mt_connection drop constraint if exists mt_connection_singleton;
alter table public.mt_connection drop constraint if exists mt_connection_pkey;

-- The partial unique index from 025 is superseded by the new primary key.
drop index if exists mt_connection_org_id_key;

alter table public.mt_connection alter column org_id set not null;
alter table public.mt_connection add primary key (org_id);
alter table public.mt_connection drop column if exists id;
