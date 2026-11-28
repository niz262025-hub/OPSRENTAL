-- STAGING-ONLY proposal. This is a deny guard, not an upload/download grant.
-- It cannot stop a service-role client, existing signed URLs or a public bucket.
-- Before deployment, verify the actual bucket exists and is private. Never
-- insert, change or delete storage objects through SQL.
begin;
do $$
begin
  if current_setting('myops.allow_rental_staging',true) is distinct from 'wengxxiqwtosirealghx' then
    raise exception 'Explicit isolated rental staging guard required';
  end if;
  if not exists(select 1 from storage.buckets where id='opsrental-private' and public=false) then
    raise exception 'Private opsrental-private bucket must be verified first';
  end if;
end $$;
drop policy if exists opsrental_private_deny_guard on storage.objects;
create policy opsrental_private_deny_guard on storage.objects as restrictive
  for all to public
  using (bucket_id <> 'opsrental-private')
  with check (bucket_id <> 'opsrental-private');
commit;
