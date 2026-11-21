import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('storage deny guard blocks all ordinary access to rental bucket without changing other buckets',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated; create schema storage;
   create table storage.buckets(id text primary key, public boolean not null);
   create table storage.objects(id integer primary key,bucket_id text not null);
   insert into storage.buckets values('opsrental-private',false),('other-private',false);
   insert into storage.objects values(1,'opsrental-private'),(2,'other-private');
   alter table storage.objects enable row level security;
   grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;
   create policy fixture_broad on storage.objects for all to authenticated using (true) with check (true);`);
  const sql=await readFile(new URL('../supabase/proposals/rental_storage_deny_guard.sql',import.meta.url),'utf8');
  await assert.rejects(db.exec(sql),/Explicit isolated rental staging guard required/);
  await db.exec('rollback');
  await db.exec("set myops.allow_rental_staging='wengxxiqwtosirealghx'");
  await db.exec(sql);await db.exec(sql);await db.exec('set role authenticated');
  assert.deepEqual((await db.query('select id from storage.objects order by id')).rows.map(r=>r.id),[2]);
  await assert.rejects(db.query("insert into storage.objects values(3,'opsrental-private')"),/row-level security/);
  await assert.rejects(db.query("update storage.objects set bucket_id='opsrental-private' where id=2"),/row-level security/);
  assert.equal((await db.query('delete from storage.objects where id=1 returning id')).rows.length,0);
  assert.equal((await db.query('select id from storage.objects')).rows.length,1);
 } finally {await db.close()}
});
