# OpsRental access disable and recovery proposal

This procedure is not a hosted migration. Apply only after verifying the target,
recovery readiness, current role grants and storage bucket. Never delete records.

1. Set `MYOPS_RENTAL_ACCESS_DISABLED=true` on the intended Vercel environment
   and deploy that environment's reviewed branch. Existing deployments retain
   their previous environment until redeployed. Verify the current deployment
   returns 503 for redeem, session, organizations, read and write; this prevents
   new application sessions and use of existing app sessions through these APIs.
2. Disable every other privileged service-role consumer and prevent bypass via
   independently deployed functions. The flag does not revoke a service key,
   close already running requests, or invalidate the underlying central login.
3. After staging backup and isolation gates pass, an authorized database operator
   may review and run `supabase/proposals/rental_staging_access_rollback.sql` on
   the verified staging target. It revokes ordinary role access and retains data.
   It does not affect privileged clients or storage access. Never run on production.
4. Private object signed URLs already issued may remain usable until expiry;
   stop issuing new ones immediately. Existing Storage API tokens and service
   credentials require their own authorized revocation or expiry. This code does
   not yet issue rental signed URLs, and the duration of any pre-existing URLs is
   unknown. Do not assume they are revoked by SQL or the flag.
5. Re-enable only after reviewing entitlement and membership, applying a tested
   access plan and redeploying with the flag unset. Verify the old deployment is
   no longer accessible before considering the incident closed.

The `rental_storage_deny_guard.sql` proposal denies ordinary role access to a
verified private `opsrental-private` bucket; it cannot restrict service-role
requests, public buckets, or previously issued signed URLs. It is not an
implementation of authorized rental document access.
