-- Run on isolated Central staging before the document and storage guard proposals.
begin;
do $guard$
begin
  if current_setting('myops.allow_rental_staging', true) is distinct from 'wengxxiqwtosirealghx' then
    raise exception 'Explicit isolated rental staging guard required';
  end if;
  if exists (select 1 from storage.buckets where id='opsrental-private' and public is distinct from false) then
    raise exception 'Existing rental bucket must be private';
  end if;
end
$guard$;
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('opsrental-private', 'opsrental-private', false, 3145728,
        array['application/pdf', 'image/png', 'image/jpeg', 'text/plain'])
on conflict (id) do nothing;
commit;
