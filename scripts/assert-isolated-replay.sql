-- Catalog-based checks are supplemented with synthetic tenant fixtures in a transaction.
DO $$
DECLARE t text; r text; p text; f text; i text;
BEGIN
  FOREACH t IN ARRAY ARRAY['rental_properties','rental_leases','rental_payments','rental_tickets','rental_documents','myops_rental_trial_operations'] LOOP
    IF to_regclass('public.'||t) IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=to_regclass('public.'||t)) THEN RAISE EXCEPTION 'Missing table or RLS: %',t; END IF;
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
        IF has_table_privilege(r,'public.'||t,p) THEN RAISE EXCEPTION 'Unexpected browser privilege: % % %',t,r,p; END IF;
      END LOOP;
    END LOOP;
    FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
      IF NOT has_table_privilege('service_role','public.'||t,p) THEN RAISE EXCEPTION 'Missing service privilege: % %',t,p; END IF;
    END LOOP;
  END LOOP;
  FOREACH p IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege('service_role','public.myops_rental_trial_operations',p) THEN RAISE EXCEPTION 'Excess trial ledger privilege %',p; END IF;
  END LOOP;
  FOREACH f IN ARRAY ARRAY['myops_rental_lock_trial(uuid,uuid)','myops_rental_expire_empty_uploads(uuid,uuid)','myops_rental_trial_create(uuid,uuid,uuid,text,jsonb)','myops_rental_trial_upload(uuid,uuid,uuid,text,uuid,uuid,text,boolean)'] LOOP
    IF to_regprocedure('public.'||f) IS NULL OR has_function_privilege('anon','public.'||f,'EXECUTE') OR has_function_privilege('authenticated','public.'||f,'EXECUTE') OR NOT has_function_privilege('service_role','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'RPC ACL mismatch: %',f; END IF;
  END LOOP;
  FOREACH i IN ARRAY ARRAY['rental_documents_storage_path_unique','rental_documents_org_lease_idx','rental_documents_org_property_idx','rental_leases_org_idx','rental_leases_tenant_idx','rental_payments_lease_idx','rental_payments_org_due_idx','rental_properties_org_idx','rental_tickets_lease_idx','rental_tickets_org_status_idx'] LOOP
    IF to_regclass('public.'||i) IS NULL THEN RAISE EXCEPTION 'Missing index: %',i; END IF;
  END LOOP;
  IF NOT EXISTS (SELECT FROM storage.buckets WHERE id='opsrental-private' AND public=false AND file_size_limit=3145728) THEN RAISE EXCEPTION 'private bucket missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='opsrental_private_deny_guard' AND permissive='RESTRICTIVE') THEN RAISE EXCEPTION 'Storage guard missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='public.rental_documents'::regclass AND conname='rental_documents_one_association') THEN RAISE EXCEPTION 'document association guard missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_constraint WHERE conrelid='public.rental_documents'::regclass AND conname='rental_documents_property_org_fk') THEN RAISE EXCEPTION 'tenant bound document FK missing'; END IF;
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='rental_payments' AND column_name='amount' AND numeric_precision=12 AND numeric_scale=2) THEN RAISE EXCEPTION 'payment precision missing'; END IF;
END $$;

BEGIN;
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
INSERT INTO public.myops_organizations(id,name,owner_user_id) VALUES
 ('20000000-0000-0000-0000-000000000001','Synthetic A','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000002','Synthetic B','10000000-0000-0000-0000-000000000002');
INSERT INTO public.rental_properties(id,organization_id,name,address,created_by) VALUES
 ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Synthetic A','Fixture','10000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Synthetic B','Fixture','10000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  BEGIN
    INSERT INTO public.rental_leases(organization_id,property_id,tenant_user_id,monthly_rent,start_date)
      VALUES('20000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',10,current_date);
    RAISE EXCEPTION 'A-to-B tenant FK accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.rental_leases(organization_id,property_id,tenant_user_id,monthly_rent,start_date)
      VALUES('20000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002',10,current_date);
    RAISE EXCEPTION 'B-to-A tenant FK accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.rental_properties LIMIT 1;
    RAISE EXCEPTION 'authenticated browser read accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.myops_rental_trial_create(NULL,NULL,NULL,NULL,NULL);
    RAISE EXCEPTION 'anonymous trial RPC accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.rental_properties WHERE name IN ('Synthetic A','Synthetic B')) <> 2 THEN
    RAISE EXCEPTION 'service role unable to read synthetic fixtures';
  END IF;
END $$;
RESET ROLE;
ROLLBACK;
