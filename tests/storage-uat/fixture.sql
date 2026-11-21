-- Disposable local runner ONLY: no real MYOPS/Auth objects or data.
create table public.myops_app_sessions (id uuid primary key, app_id text, product_slug text, user_id uuid, revoked_at timestamptz);
create table public.myops_memberships (user_id uuid, organization_id uuid, status text, role text);
create table public.myops_app_grants (user_id uuid, organization_id uuid, product_slug text);
create table public.myops_subscriptions (organization_id uuid, personal_user_id uuid, status text, product_slug text, is_complete_bundle boolean, current_period_end timestamptz);
create table public.myops_lifetime_entitlements (user_id uuid, status text, scope text);
create table public.rental_properties (id uuid primary key, organization_id uuid not null);
create table public.rental_leases (id uuid primary key, organization_id uuid not null, tenant_user_id uuid not null);
create table public.rental_documents (id uuid primary key, organization_id uuid not null, property_id uuid, lease_id uuid, uploaded_by uuid not null, filename text not null, storage_path text unique not null, state text not null, created_at timestamptz default now());
alter table public.rental_documents enable row level security;
revoke all on public.rental_documents from public, anon, authenticated;
grant all on public.myops_app_sessions,public.myops_memberships,public.myops_app_grants,public.myops_subscriptions,public.myops_lifetime_entitlements,public.rental_properties,public.rental_leases,public.rental_documents to service_role;
insert into public.myops_app_sessions values ('00000000-0000-4000-8000-000000000001','opsrental','opsrental','00000000-0000-4000-8000-000000000002',null);
insert into public.myops_memberships values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','active','owner');
insert into public.myops_app_grants values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','opsrental');
insert into public.myops_subscriptions values ('00000000-0000-4000-8000-000000000003',null,'active','opsrental',false,null);
insert into public.rental_properties values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003');
insert into public.rental_leases values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000006');
notify pgrst, 'reload schema';
