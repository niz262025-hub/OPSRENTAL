-- Proposal only: DO NOT APPLY to hosted staging or production.
-- Private document metadata and storage access remain service-role mediated.
-- Requires explicit isolated staging transaction setting before execution.
begin;
do $$ begin
 if current_setting('myops.allow_rental_staging',true) is distinct from 'wengxxiqwtosirealghx'
 then raise exception 'Isolated staging guard required'; end if;
 if not exists(select 1 from storage.buckets where id='opsrental-private' and public=false)
 then raise exception 'Private rental bucket not verified'; end if;
 if to_regclass('public.rental_documents') is null
 then raise exception 'Rental document metadata table missing'; end if;
end $$;
alter table public.rental_documents enable row level security;
revoke all on public.rental_documents from public, anon, authenticated;
create index if not exists rental_documents_org_lease_idx on public.rental_documents(organization_id,lease_id);
create unique index if not exists rental_documents_path_unique_idx on public.rental_documents(storage_path);
-- Keep existing restrictive Storage deny guard; no authenticated/anon grants.
-- Service-role bypasses RLS, so all document operations MUST check session,
-- organization membership, entitlement and metadata ownership on the server.
commit;
