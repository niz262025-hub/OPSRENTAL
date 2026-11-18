-- OpsRental existing-schema compatibility migration (2026-11-18)
-- Existing rental_properties, rental_leases, rental_payments, rental_tickets,
-- rental_documents tables are already provisioned in MYOPS-Central-Auth.
-- Do NOT recreate them or replace existing tenant isolation policies.
-- No-op: prevents incompatible prototype schema from being applied.
-- Pending: verify current RLS with authenticated owner/tenant sessions,
-- verify Supabase Storage document policies, connect UI to the MYOPS SSO
-- identity and the existing organization_id-scoped rental tables.
select 1 as opsrental_existing_schema_preserved;
