-- Isolated review only. Apply after rental_document_management and rental_trial_atomic.
BEGIN;
CREATE FUNCTION public.myops_rental_trial_upload(
 p_session uuid,p_org uuid,p_operation uuid,p_filename text,p_property uuid,p_lease uuid,
 p_sha256 text,p_finalize boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
 t public.myops_trials%rowtype;
 op public.myops_rental_trial_operations%rowtype;
 doc public.rental_documents%rowtype;
 request_body jsonb;
 used integer;
BEGIN
 IF p_operation IS NULL OR (p_property IS NULL)=(p_lease IS NULL)
   OR p_filename IS NULL OR length(btrim(p_filename)) NOT BETWEEN 1 AND 180
   OR p_filename ~ '[[:cntrl:]/]' OR strpos(p_filename,chr(92))>0
   OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Invalid document metadata' USING ERRCODE='22023';
 END IF;
 t:=public.myops_rental_lock_trial(p_session,p_org);
 request_body:=jsonb_build_object('filename',p_filename,'property_id',p_property,'lease_id',p_lease,'sha256',p_sha256);
 SELECT * INTO op FROM public.myops_rental_trial_operations
 WHERE trial_id=t.id AND app_id='opsrental' AND operation_id=p_operation;
 IF FOUND THEN
  IF op.user_id<>t.user_id OR op.organization_id<>p_org OR op.operation_type<>'upload_document'
    OR op.request_body<>request_body OR op.status NOT IN ('uploading','completed') THEN
   RAISE EXCEPTION 'Operation conflict' USING ERRCODE='23505';
  END IF;
  IF op.status='completed' THEN
   RETURN jsonb_build_object('status','completed','item',op.result,'replayed',true);
  END IF;
  SELECT * INTO doc FROM public.rental_documents
  WHERE id=(op.recovery_metadata->>'document_id')::uuid AND organization_id=p_org AND state='pending'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pending document missing'; END IF;
 ELSE
  IF p_finalize THEN RAISE EXCEPTION 'Reservation required' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO used FROM public.myops_rental_trial_operations
  WHERE trial_id=t.id AND app_id='opsrental' AND status IN ('pending','uploading','completed','recovery_required');
  IF used>=30 THEN RETURN jsonb_build_object('error','trial_limit_reached','limit',30,'used',used); END IF;
  doc.id:=gen_random_uuid();
  INSERT INTO public.rental_documents(id,organization_id,property_id,lease_id,uploaded_by,filename,storage_path,state)
  VALUES(doc.id,p_org,p_property,p_lease,t.user_id,p_filename,p_org::text||'/'||doc.id::text,'pending')
  RETURNING * INTO doc;
  INSERT INTO public.myops_rental_trial_operations(
   trial_id,organization_id,user_id,operation_id,operation_type,request_body,status,recovery_metadata
  ) VALUES(t.id,p_org,t.user_id,p_operation,'upload_document',request_body,'uploading',
   jsonb_build_object('document_id',doc.id,'storage_path',doc.storage_path));
 END IF;
 IF NOT p_finalize THEN
  RETURN jsonb_build_object('status','uploading','document_id',doc.id,'storage_path',doc.storage_path);
 END IF;
 -- The trusted API must verify the immutable object's bytes against p_sha256
 -- before calling finalize. This check additionally requires its Storage row.
 PERFORM o.id FROM storage.objects o JOIN storage.buckets b ON b.id=o.bucket_id
 WHERE b.id='opsrental-private' AND b.public=false AND o.name=doc.storage_path FOR SHARE OF o,b;
 IF NOT FOUND THEN RAISE EXCEPTION 'Private storage object missing'; END IF;
 UPDATE public.rental_documents SET state='ready' WHERE id=doc.id RETURNING * INTO doc;
 UPDATE public.myops_rental_trial_operations
 SET status='completed',completed_at=clock_timestamp(),result=to_jsonb(doc)
 WHERE trial_id=t.id AND app_id='opsrental' AND operation_id=p_operation;
 RETURN jsonb_build_object('status','completed','item',to_jsonb(doc),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION public.myops_rental_trial_upload(uuid,uuid,uuid,text,uuid,uuid,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myops_rental_trial_upload(uuid,uuid,uuid,text,uuid,uuid,text,boolean) TO service_role;
COMMIT;
