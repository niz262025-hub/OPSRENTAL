-- Staging-only private Storage guard. Provision the bucket using the Storage API first.
BEGIN;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id='opsrental-private' AND public=false AND file_size_limit=3145728) THEN
  RAISE EXCEPTION 'Expected private OpsRental staging bucket must exist';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='opsrental_private_deny_guard') THEN
  CREATE POLICY opsrental_private_deny_guard ON storage.objects AS RESTRICTIVE FOR ALL TO PUBLIC USING (bucket_id <> 'opsrental-private') WITH CHECK (bucket_id <> 'opsrental-private');
 END IF;
END $$;
COMMIT;
