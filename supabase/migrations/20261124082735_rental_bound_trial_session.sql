-- Requires Central organization binding and the Rental trial ledger.
begin;
CREATE OR REPLACE FUNCTION public.myops_rental_lock_trial(p_session uuid,p_org uuid)
RETURNS public.myops_trials LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE s jsonb; t public.myops_trials%rowtype; v_org uuid;
BEGIN
 SELECT organization_id INTO v_org FROM public.myops_app_sessions
 WHERE id=p_session AND app_id='opsrental' AND product_slug='opsrental';
 IF NOT FOUND THEN RAISE EXCEPTION 'Session denied' USING ERRCODE='42501'; END IF;
 IF v_org IS NOT NULL THEN
  IF v_org<>p_org THEN RAISE EXCEPTION 'Organization denied' USING ERRCODE='42501'; END IF;
  s:=public.myops_validate_org_app_session(p_session,'opsrental','opsrental',false);
  IF s->>'organization_id' IS DISTINCT FROM v_org::text THEN RAISE EXCEPTION 'Session denied' USING ERRCODE='42501'; END IF;
 ELSE
  s:=public.myops_validate_app_session(p_session,'opsrental','opsrental',false);
 END IF;
 IF s->>'active' IS DISTINCT FROM 'true' OR s->>'user_id' IS NULL THEN RAISE EXCEPTION 'Session denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.myops_trials WHERE user_id=(s->>'user_id')::uuid FOR UPDATE;
 IF NOT FOUND OR t.status<>'active' OR t.policy_version<>1 OR t.started_at>clock_timestamp() OR t.expires_at<=clock_timestamp() OR t.expires_at<>t.started_at+interval '168 hours' THEN
  RAISE EXCEPTION 'Trial inactive' USING ERRCODE='42501'; END IF;
 IF (t.organization_id IS NOT NULL AND t.organization_id<>p_org)
  OR NOT EXISTS (SELECT 1 FROM public.myops_organizations WHERE id=p_org AND owner_user_id=t.user_id)
  OR NOT EXISTS (SELECT 1 FROM public.myops_memberships WHERE user_id=t.user_id AND organization_id=p_org AND status='active' AND role IN ('owner','admin'))
  OR (SELECT count(*) FROM public.myops_memberships WHERE organization_id=p_org AND status='active')<>1 THEN
  RAISE EXCEPTION 'Organization denied' USING ERRCODE='42501'; END IF;
 IF EXISTS (SELECT 1 FROM public.myops_rental_trial_operations WHERE trial_id=t.id AND organization_id<>p_org) THEN
  RAISE EXCEPTION 'Trial organization already bound' USING ERRCODE='42501'; END IF;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION public.myops_rental_lock_trial(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.myops_rental_lock_trial(uuid,uuid) TO service_role;

commit;
