-- REVIEW ONLY. Requires central MYOPS and OpsRental tables in the SAME database.
-- Do not apply to a hosted environment without explicit approval.
BEGIN;
CREATE TABLE public.myops_rental_trial_operations (
 trial_id uuid NOT NULL REFERENCES public.myops_trials(id),
 app_id text NOT NULL DEFAULT 'opsrental' CHECK(app_id='opsrental'),
 organization_id uuid NOT NULL REFERENCES public.myops_organizations(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 operation_id uuid NOT NULL,
 operation_type text NOT NULL CHECK(operation_type IN ('properties','leases','payments','tickets','upload_document')),
 request_body jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('pending','uploading','completed','failed','recovery_required')),
 result jsonb,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 recovery_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 PRIMARY KEY(trial_id,app_id,operation_id)
);
ALTER TABLE public.myops_rental_trial_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.myops_rental_trial_operations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.myops_rental_trial_operations TO service_role;

-- The validated session is checked inside the same transaction as the mutation.
-- Only the trusted service role may invoke this RPC. JSON fields are allowlisted.
CREATE FUNCTION public.myops_rental_trial_create(p_session uuid,p_org uuid,p_operation uuid,p_kind text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s jsonb; t public.myops_trials%rowtype; old_op public.myops_rental_trial_operations%rowtype;
 used integer; row_data jsonb; valid_fields text[];
BEGIN
 IF p_session IS NULL OR p_org IS NULL OR p_operation IS NULL OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
 s:=public.myops_validate_app_session(p_session,'opsrental','opsrental',false);
 IF s->>'active' IS DISTINCT FROM 'true' OR s->>'user_id' IS NULL THEN RAISE EXCEPTION 'Session denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.myops_trials WHERE user_id=(s->>'user_id')::uuid FOR UPDATE;
 IF NOT FOUND OR t.status<>'active' OR t.policy_version<>1 OR t.started_at>now() OR t.expires_at<=now() OR t.expires_at<>t.started_at+interval '168 hours' THEN
  RAISE EXCEPTION 'Trial inactive' USING ERRCODE='42501'; END IF;
 IF (t.organization_id IS NOT NULL AND t.organization_id<>p_org)
  OR NOT EXISTS (SELECT 1 FROM public.myops_organizations WHERE id=p_org AND owner_user_id=t.user_id)
  OR NOT EXISTS (SELECT 1 FROM public.myops_memberships WHERE user_id=t.user_id AND organization_id=p_org AND status='active' AND role IN ('owner','admin'))
  OR (SELECT count(*) FROM public.myops_memberships WHERE organization_id=p_org AND status='active')<>1 THEN
  RAISE EXCEPTION 'Organization denied' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.myops_rental_trial_operations WHERE trial_id=t.id AND organization_id<>p_org) THEN
  RAISE EXCEPTION 'Trial organization already bound' USING ERRCODE='42501'; END IF;
 valid_fields:=CASE p_kind WHEN 'properties' THEN ARRAY['name','address','unit_label','parking_spaces']
  WHEN 'leases' THEN ARRAY['property_id','tenant_user_id','monthly_rent','currency','start_date','end_date','status','parking_spaces']
  WHEN 'payments' THEN ARRAY['lease_id','amount','due_date','paid_at','status','reference']
  WHEN 'tickets' THEN ARRAY['lease_id','title','description','status'] ELSE NULL END;
 IF valid_fields IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_input) AS k WHERE NOT k=ANY(valid_fields)) THEN
  RAISE EXCEPTION 'Invalid fields' USING ERRCODE='22023'; END IF;
 SELECT * INTO old_op FROM public.myops_rental_trial_operations WHERE trial_id=t.id AND app_id='opsrental' AND operation_id=p_operation;
 IF FOUND THEN
  IF old_op.user_id<>t.user_id OR old_op.organization_id<>p_org OR old_op.operation_type<>p_kind OR old_op.request_body<>p_input OR old_op.status<>'completed' THEN
   RAISE EXCEPTION 'Operation conflict' USING ERRCODE='23505'; END IF;
  RETURN jsonb_build_object('item',old_op.result,'replayed',true);
 END IF;
 SELECT count(*) INTO used FROM public.myops_rental_trial_operations WHERE trial_id=t.id AND app_id='opsrental' AND status IN ('pending','uploading','completed','recovery_required');
 IF used>=30 THEN RETURN jsonb_build_object('error','trial_limit_reached','limit',30,'used',used); END IF;
 IF p_kind='properties' THEN
  INSERT INTO public.rental_properties(organization_id,name,address,unit_label,parking_spaces,created_by)
   VALUES(p_org,p_input->>'name',p_input->>'address',p_input->>'unit_label',coalesce((p_input->>'parking_spaces')::int,0),t.user_id) RETURNING to_jsonb(rental_properties.*) INTO row_data;
 ELSIF p_kind='leases' THEN
  INSERT INTO public.rental_leases(organization_id,property_id,tenant_user_id,monthly_rent,currency,start_date,end_date,status,parking_spaces)
   VALUES(p_org,(p_input->>'property_id')::uuid,(p_input->>'tenant_user_id')::uuid,(p_input->>'monthly_rent')::numeric,coalesce(p_input->>'currency','MYR'),(p_input->>'start_date')::date,(p_input->>'end_date')::date,coalesce(p_input->>'status','active'),coalesce((p_input->>'parking_spaces')::int,0)) RETURNING to_jsonb(rental_leases.*) INTO row_data;
 ELSIF p_kind='payments' THEN
  INSERT INTO public.rental_payments(organization_id,lease_id,amount,due_date,paid_at,status,reference)
   VALUES(p_org,(p_input->>'lease_id')::uuid,(p_input->>'amount')::numeric,(p_input->>'due_date')::date,(p_input->>'paid_at')::timestamptz,coalesce(p_input->>'status','pending'),p_input->>'reference') RETURNING to_jsonb(rental_payments.*) INTO row_data;
 ELSE
  INSERT INTO public.rental_tickets(organization_id,lease_id,title,description,status,created_by)
   VALUES(p_org,(p_input->>'lease_id')::uuid,p_input->>'title',p_input->>'description',coalesce(p_input->>'status','open'),t.user_id) RETURNING to_jsonb(rental_tickets.*) INTO row_data;
 END IF;
 INSERT INTO public.myops_rental_trial_operations(trial_id,organization_id,user_id,operation_id,operation_type,request_body,status,result,completed_at)
  VALUES(t.id,p_org,t.user_id,p_operation,p_kind,p_input,'completed',row_data,clock_timestamp());
 RETURN jsonb_build_object('item',row_data,'replayed',false,'used',used+1,'limit',30);
END $$;
REVOKE ALL ON FUNCTION public.myops_rental_trial_create(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myops_rental_trial_create(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
