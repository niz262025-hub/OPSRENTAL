-- STAGING PROPOSAL: deny by default. Do not apply to production.
-- Requires an explicit transaction-local guard and a verified isolated database.
-- No customer data, grants, or application client registrations are included.
do $$ begin
  if current_setting('myops.allow_rental_staging', true) is distinct from 'wengxxiqwtosirealghx' then
    raise exception 'Explicit isolated rental staging guard required';
  end if;
end $$;
create table public.rental_properties (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.myops_organizations(id),
 name text not null check(length(trim(name))>0), address text not null, unit_label text,
 parking_spaces integer not null default 0 check(parking_spaces>=0), created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), unique(id,organization_id)
);
create table public.rental_leases (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, property_id uuid not null,
 tenant_user_id uuid not null references auth.users(id), monthly_rent numeric not null check(monthly_rent>=0),
 currency text not null default 'MYR' check(currency ~ '^[A-Z]{3}$'), start_date date not null, end_date date,
 status text not null default 'active' check(status in ('draft','active','ended')),
 parking_spaces integer not null default 0 check(parking_spaces>=0), created_at timestamptz not null default now(),
 unique(id,organization_id), foreign key(property_id,organization_id) references public.rental_properties(id,organization_id),
 check(end_date is null or end_date>=start_date)
);
create table public.rental_payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, lease_id uuid not null,
 amount numeric not null check(amount>0), due_date date not null, paid_at timestamptz,
 status text not null default 'pending' check(status in ('pending','paid','overdue')), reference text,
 created_at timestamptz not null default now(), foreign key(lease_id,organization_id) references public.rental_leases(id,organization_id)
);
create table public.rental_tickets (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, lease_id uuid not null,
 created_by uuid not null references auth.users(id), title text not null check(length(trim(title))>0), description text,
 status text not null default 'open' check(status in ('open','in_progress','resolved','closed')),
 created_at timestamptz not null default now(), foreign key(lease_id,organization_id) references public.rental_leases(id,organization_id)
);
create table public.rental_documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, lease_id uuid not null,
 uploaded_by uuid not null references auth.users(id), filename text not null, storage_path text not null check(length(trim(storage_path))>0),
 created_at timestamptz not null default now(), foreign key(lease_id,organization_id) references public.rental_leases(id,organization_id)
);
create index rental_properties_org_idx on public.rental_properties(organization_id);
create index rental_leases_org_idx on public.rental_leases(organization_id);
create index rental_leases_tenant_idx on public.rental_leases(tenant_user_id);
create index rental_payments_lease_idx on public.rental_payments(lease_id);
create index rental_payments_org_due_idx on public.rental_payments(organization_id,due_date);
create index rental_tickets_lease_idx on public.rental_tickets(lease_id);
create index rental_tickets_org_status_idx on public.rental_tickets(organization_id,status);
create unique index rental_documents_storage_path_unique on public.rental_documents(storage_path);
alter table public.rental_properties enable row level security;
alter table public.rental_leases enable row level security;
alter table public.rental_payments enable row level security;
alter table public.rental_tickets enable row level security;
alter table public.rental_documents enable row level security;
revoke all on public.rental_properties, public.rental_leases, public.rental_payments, public.rental_tickets, public.rental_documents from public, anon, authenticated;
-- No policies or service-role grants are created until the tenant model and broker are tested.
