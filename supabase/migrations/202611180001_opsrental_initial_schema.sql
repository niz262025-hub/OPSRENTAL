-- OpsRental initial schema; REVIEW before applying to a dedicated Supabase project.
-- Uses MYOPS Central Auth UUIDs; integration must verify JWT issuer and user mapping.
create extension if not exists pgcrypto;

create table if not exists public.rental_properties (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null,
 name text not null,
 address text not null,
 created_at timestamptz not null default now()
);
create table if not exists public.rental_leases (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.rental_properties(id) on delete cascade,
 tenant_user_id uuid not null,
 start_date date not null,
 end_date date,
 monthly_rent numeric(12,2) not null check (monthly_rent >= 0),
 contract_path text,
 created_at timestamptz not null default now(),
 check (end_date is null or end_date >= start_date)
);
create table if not exists public.rental_payments (
 id uuid primary key default gen_random_uuid(),
 lease_id uuid not null references public.rental_leases(id) on delete cascade,
 amount numeric(12,2) not null check (amount > 0),
 paid_on date,
 status text not null default 'pending' check (status in ('pending','paid','overdue')),
 recorded_by uuid not null,
 created_at timestamptz not null default now()
);
create table if not exists public.rental_tickets (
 id uuid primary key default gen_random_uuid(),
 lease_id uuid not null references public.rental_leases(id) on delete cascade,
 created_by uuid not null,
 subject text not null,
 description text,
 status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
 created_at timestamptz not null default now()
);
create table if not exists public.rental_parking (
 id uuid primary key default gen_random_uuid(),
 property_id uuid not null references public.rental_properties(id) on delete cascade,
 lease_id uuid references public.rental_leases(id) on delete set null,
 slot_label text not null,
 unique(property_id,slot_label)
);
alter table public.rental_properties enable row level security;
alter table public.rental_leases enable row level security;
alter table public.rental_payments enable row level security;
alter table public.rental_tickets enable row level security;
alter table public.rental_parking enable row level security;

create policy rental_property_owner_select on public.rental_properties for select to authenticated
 using (owner_user_id = (select auth.uid()));
create policy rental_property_owner_insert on public.rental_properties for insert to authenticated
 with check (owner_user_id = (select auth.uid()));
create policy rental_property_owner_update on public.rental_properties for update to authenticated
 using (owner_user_id = (select auth.uid())) with check (owner_user_id = (select auth.uid()));
create policy rental_property_owner_delete on public.rental_properties for delete to authenticated
 using (owner_user_id = (select auth.uid()));
create policy rental_property_tenant_select on public.rental_properties for select to authenticated
 using (exists(select 1 from public.rental_leases l where l.property_id=id and l.tenant_user_id=(select auth.uid())));

create policy rental_lease_select on public.rental_leases for select to authenticated
 using (tenant_user_id=(select auth.uid()) or exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())));
create policy rental_lease_owner_insert on public.rental_leases for insert to authenticated
 with check (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())));
create policy rental_lease_owner_update on public.rental_leases for update to authenticated
 using (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())))
 with check (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())));

create policy rental_payment_select on public.rental_payments for select to authenticated
 using (exists(select 1 from public.rental_leases l where l.id=lease_id and (l.tenant_user_id=(select auth.uid()) or exists(select 1 from public.rental_properties p where p.id=l.property_id and p.owner_user_id=(select auth.uid())))));
create policy rental_payment_insert on public.rental_payments for insert to authenticated
 with check (recorded_by=(select auth.uid()) and exists(select 1 from public.rental_leases l where l.id=lease_id and (l.tenant_user_id=(select auth.uid()) or exists(select 1 from public.rental_properties p where p.id=l.property_id and p.owner_user_id=(select auth.uid())))));
create policy rental_payment_owner_update on public.rental_payments for update to authenticated
 using (exists(select 1 from public.rental_leases l join public.rental_properties p on p.id=l.property_id where l.id=lease_id and p.owner_user_id=(select auth.uid())))
 with check (exists(select 1 from public.rental_leases l join public.rental_properties p on p.id=l.property_id where l.id=lease_id and p.owner_user_id=(select auth.uid())));

create policy rental_ticket_select on public.rental_tickets for select to authenticated
 using (exists(select 1 from public.rental_leases l where l.id=lease_id and (l.tenant_user_id=(select auth.uid()) or exists(select 1 from public.rental_properties p where p.id=l.property_id and p.owner_user_id=(select auth.uid())))));
create policy rental_ticket_insert on public.rental_tickets for insert to authenticated
 with check (created_by=(select auth.uid()) and exists(select 1 from public.rental_leases l where l.id=lease_id and (l.tenant_user_id=(select auth.uid()) or exists(select 1 from public.rental_properties p where p.id=l.property_id and p.owner_user_id=(select auth.uid())))));
create policy rental_ticket_owner_update on public.rental_tickets for update to authenticated
 using (exists(select 1 from public.rental_leases l join public.rental_properties p on p.id=l.property_id where l.id=lease_id and p.owner_user_id=(select auth.uid())))
 with check (exists(select 1 from public.rental_leases l join public.rental_properties p on p.id=l.property_id where l.id=lease_id and p.owner_user_id=(select auth.uid())));

create policy rental_parking_select on public.rental_parking for select to authenticated
 using (exists(select 1 from public.rental_properties p where p.id=property_id and (p.owner_user_id=(select auth.uid()) or exists(select 1 from public.rental_leases l where l.property_id=p.id and l.tenant_user_id=(select auth.uid())))));
create policy rental_parking_owner_insert on public.rental_parking for insert to authenticated
 with check (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())));
create policy rental_parking_owner_update on public.rental_parking for update to authenticated
 using (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())))
 with check (exists(select 1 from public.rental_properties p where p.id=property_id and p.owner_user_id=(select auth.uid())));
-- No anonymous grants, no service-role client access. Validate all policies with two tenants before release.
