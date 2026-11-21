-- STAGING SECURITY ROLLBACK PROPOSAL ONLY: do not run against hosted databases
-- until recovery and isolation gates pass. This disables direct API access to
-- the foundation tables; it never drops tables, policies, constraints or data.
-- A trusted service-role client bypasses RLS and grants: disable its API access
-- separately before relying on this rollback. Existing signed Storage URLs and
-- privileged Storage credentials are not revoked by this SQL.
do $$
begin
  if current_setting('myops.allow_rental_staging', true) is distinct from 'wengxxiqwtosirealghx' then
    raise exception 'Explicit isolated rental staging guard required';
  end if;
  if to_regclass('public.myops_rental_staging_foundation_marker') is null or
     not exists(select 1 from public.myops_rental_staging_foundation_marker where version='20261121104119') then
    raise exception 'Verified rental foundation required';
  end if;
end $$;
revoke all on public.rental_properties, public.rental_leases, public.rental_payments,
  public.rental_tickets, public.rental_documents from public, anon, authenticated;
