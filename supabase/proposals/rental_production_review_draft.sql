-- REVIEW DRAFT ONLY; NOT A MIGRATION. Intentionally fails until a reviewer
-- prepares an environment-specific plan. Never remove this guard in-place.
-- Requires backup, restore rehearsal, existing policy review and approval.
begin;
do $$ begin raise exception 'REVIEW DRAFT: DO NOT EXECUTE'; end $$;
-- Precondition: public.rental_documents and rental_properties exist with the
-- current (id, organization_id) unique key; inspect all existing records and
-- policies first. Existing lease FK and existing RLS policies are retained.
alter table public.rental_documents add column property_id uuid;
alter table public.rental_documents add column state text not null default 'pending';
alter table public.rental_documents alter column lease_id drop not null;
alter table public.rental_documents add constraint rental_documents_state_check
 check (state in ('pending','ready','deleting')) not valid;
alter table public.rental_documents add constraint rental_documents_one_target_check
 check ((lease_id is null) <> (property_id is null)) not valid;
alter table public.rental_documents add constraint rental_documents_property_org_fk
 foreign key (property_id,organization_id) references public.rental_properties(id,organization_id) not valid;
create index rental_documents_org_property_idx on public.rental_documents(organization_id,property_id);
create index rental_documents_org_lease_idx on public.rental_documents(organization_id,lease_id);
-- Legacy rows remain pending: verify ownership, paths and private objects before
-- any reviewed promotion to ready. Do not infer readiness from metadata alone.
-- Validate constraints separately after auditing existing rows and lock impact.
-- RLS stays enabled and existing policies are untouched; independently review
-- their interaction with property-linked rows and server service-role bypass.
-- Provision the private bucket through Storage API only after explicit approval;
-- inspect existing permissive policies; do not mutate storage metadata using SQL.
commit;
