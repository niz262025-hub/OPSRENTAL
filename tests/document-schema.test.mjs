import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('document proposal enforces organization associations and denies ordinary database access', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
   create table auth.users(id uuid primary key); create table public.myops_organizations(id uuid primary key);
   create table storage.buckets(id text primary key, public boolean not null);
   insert into storage.buckets values ('opsrental-private',false);
   set myops.allow_rental_staging='wengxxiqwtosirealghx';`);
  await db.exec(await readFile(new URL('../supabase/proposals/20261121104119_rental_staging_foundation.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/proposals/rental_document_management.sql',import.meta.url),'utf8'));
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',p='00000000-0000-4000-8000-000000000004',l='00000000-0000-4000-8000-000000000005';
  await db.query('insert into myops_organizations values ($1),($2)',[a,b]); await db.query('insert into auth.users values ($1)',[u]);
  await db.query("insert into rental_properties(id,organization_id,name,address,created_by) values ($1,$2,'Synthetic','Test',$3)",[p,a,u]);
  await db.query("insert into rental_leases(id,organization_id,property_id,tenant_user_id,monthly_rent,start_date) values ($1,$2,$3,$4,1,'2026-01-01')",[l,a,p,u]);
  const insert='insert into rental_documents(organization_id,property_id,lease_id,uploaded_by,filename,storage_path,state) values ($1,$2,$3,$4,$5,$6,$7)';
  await db.query(insert,[a,p,null,u,'property','one','pending']); await db.query(insert,[a,null,l,u,'lease','two','ready']);
  await assert.rejects(db.query(insert,[b,p,null,u,'foreign','three','ready']),/foreign key/);
  await assert.rejects(db.query(insert,[b,null,l,u,'foreign','four','ready']),/foreign key/);
  await assert.rejects(db.query(insert,[a,p,l,u,'both','five','ready']),/check constraint/);
  await assert.rejects(db.query(insert,[a,null,null,u,'neither','six','ready']),/check constraint/);
  await assert.rejects(db.query(insert,[a,p,null,u,'state','seven','invalid']),/check constraint/);
  await db.exec('set role authenticated'); await assert.rejects(db.query('select * from public.rental_documents'),/permission denied/);
 } finally {await db.close();}
});
