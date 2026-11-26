-- Applied staging ledger version: 20261125185211.
-- Replay after reconstructed trial operations baseline (202611260002).
BEGIN;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.myops_rental_trial_operations FROM service_role;
GRANT SELECT, INSERT, UPDATE ON public.myops_rental_trial_operations TO service_role;
DO $$
DECLARE p text;
BEGIN
 FOREACH p IN ARRAY ARRAY['SELECT','INSERT','UPDATE'] LOOP
  IF NOT has_table_privilege('service_role','public.myops_rental_trial_operations',p) THEN RAISE EXCEPTION 'Missing privilege: %',p; END IF;
 END LOOP;
 FOREACH p IN ARRAY ARRAY['DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
  IF has_table_privilege('service_role','public.myops_rental_trial_operations',p) THEN RAISE EXCEPTION 'Unexpected privilege: %',p; END IF;
 END LOOP;
END $$;
COMMIT;
