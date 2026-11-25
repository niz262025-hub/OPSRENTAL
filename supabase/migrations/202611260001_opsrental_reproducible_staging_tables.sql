-- Reconstruct missing OpsRental tables on a Central database; existing tables are preserved.
-- Requires Central organizations and Supabase auth.users. Staging server-only access.
BEGIN;
CREATE TABLE IF NOT EXISTS public.rental_properties (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  name text NOT NULL,
  address text NOT NULL,
  unit_label text,
  parking_spaces integer DEFAULT 0 NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT rental_properties_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT rental_properties_id_organization_id_key UNIQUE (id, organization_id),
  CONSTRAINT rental_properties_name_check CHECK ((length(TRIM(BOTH FROM name)) > 0)),
  CONSTRAINT rental_properties_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.myops_organizations(id),
  CONSTRAINT rental_properties_parking_spaces_check CHECK ((parking_spaces >= 0)),
  CONSTRAINT rental_properties_pkey PRIMARY KEY (id)
);
CREATE TABLE IF NOT EXISTS public.rental_leases (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  property_id uuid NOT NULL,
  tenant_user_id uuid NOT NULL,
  monthly_rent numeric NOT NULL,
  currency text DEFAULT 'MYR'::text NOT NULL,
  start_date date NOT NULL,
  end_date date,
  status text DEFAULT 'active'::text NOT NULL,
  parking_spaces integer DEFAULT 0 NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT rental_leases_check CHECK (((end_date IS NULL) OR (end_date >= start_date))),
  CONSTRAINT rental_leases_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
  CONSTRAINT rental_leases_id_organization_id_key UNIQUE (id, organization_id),
  CONSTRAINT rental_leases_monthly_rent_check CHECK ((monthly_rent >= (0)::numeric)),
  CONSTRAINT rental_leases_parking_spaces_check CHECK ((parking_spaces >= 0)),
  CONSTRAINT rental_leases_pkey PRIMARY KEY (id),
  CONSTRAINT rental_leases_property_id_organization_id_fkey FOREIGN KEY (property_id, organization_id) REFERENCES public.rental_properties(id, organization_id),
  CONSTRAINT rental_leases_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'ended'::text]))),
  CONSTRAINT rental_leases_tenant_user_id_fkey FOREIGN KEY (tenant_user_id) REFERENCES auth.users(id)
);
CREATE TABLE IF NOT EXISTS public.rental_payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  amount numeric NOT NULL,
  due_date date NOT NULL,
  paid_at timestamp with time zone,
  status text DEFAULT 'pending'::text NOT NULL,
  reference text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT rental_payments_amount_check CHECK ((amount > (0)::numeric)),
  CONSTRAINT rental_payments_lease_id_organization_id_fkey FOREIGN KEY (lease_id, organization_id) REFERENCES public.rental_leases(id, organization_id),
  CONSTRAINT rental_payments_pkey PRIMARY KEY (id),
  CONSTRAINT rental_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'overdue'::text])))
);
CREATE TABLE IF NOT EXISTS public.rental_tickets (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  lease_id uuid NOT NULL,
  created_by uuid NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'open'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT rental_tickets_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT rental_tickets_lease_id_organization_id_fkey FOREIGN KEY (lease_id, organization_id) REFERENCES public.rental_leases(id, organization_id),
  CONSTRAINT rental_tickets_pkey PRIMARY KEY (id),
  CONSTRAINT rental_tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))),
  CONSTRAINT rental_tickets_title_check CHECK ((length(TRIM(BOTH FROM title)) > 0))
);
CREATE TABLE IF NOT EXISTS public.rental_documents (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL,
  lease_id uuid,
  uploaded_by uuid NOT NULL,
  filename text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  property_id uuid,
  state text DEFAULT 'ready'::text NOT NULL,
  CONSTRAINT rental_documents_lease_id_organization_id_fkey FOREIGN KEY (lease_id, organization_id) REFERENCES public.rental_leases(id, organization_id),
  CONSTRAINT rental_documents_one_association CHECK (((lease_id IS NULL) <> (property_id IS NULL))),
  CONSTRAINT rental_documents_pkey PRIMARY KEY (id),
  CONSTRAINT rental_documents_property_org_fk FOREIGN KEY (property_id, organization_id) REFERENCES public.rental_properties(id, organization_id),
  CONSTRAINT rental_documents_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'ready'::text, 'deleting'::text]))),
  CONSTRAINT rental_documents_storage_path_check CHECK ((length(TRIM(BOTH FROM storage_path)) > 0)),
  CONSTRAINT rental_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS rental_documents_storage_path_unique ON public.rental_documents USING btree (storage_path);
CREATE INDEX IF NOT EXISTS rental_documents_org_lease_idx ON public.rental_documents USING btree (organization_id, lease_id);
CREATE INDEX IF NOT EXISTS rental_documents_org_property_idx ON public.rental_documents USING btree (organization_id, property_id);
CREATE UNIQUE INDEX IF NOT EXISTS rental_documents_path_unique_idx ON public.rental_documents USING btree (storage_path);
CREATE INDEX IF NOT EXISTS rental_leases_org_idx ON public.rental_leases USING btree (organization_id);
CREATE INDEX IF NOT EXISTS rental_leases_tenant_idx ON public.rental_leases USING btree (tenant_user_id);
CREATE INDEX IF NOT EXISTS rental_payments_lease_idx ON public.rental_payments USING btree (lease_id);
CREATE INDEX IF NOT EXISTS rental_payments_org_due_idx ON public.rental_payments USING btree (organization_id, due_date);
CREATE INDEX IF NOT EXISTS rental_properties_org_idx ON public.rental_properties USING btree (organization_id);
CREATE INDEX IF NOT EXISTS rental_tickets_lease_idx ON public.rental_tickets USING btree (lease_id);
CREATE INDEX IF NOT EXISTS rental_tickets_org_status_idx ON public.rental_tickets USING btree (organization_id, status);
ALTER TABLE public.rental_properties ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_properties FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_properties TO service_role;
ALTER TABLE public.rental_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_leases FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_leases TO service_role;
ALTER TABLE public.rental_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_payments TO service_role;
ALTER TABLE public.rental_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_tickets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_tickets TO service_role;
ALTER TABLE public.rental_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rental_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rental_documents TO service_role;
COMMIT;