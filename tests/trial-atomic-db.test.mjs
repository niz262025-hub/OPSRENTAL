import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

test('atomic trial SQL rejects 31st operation, deduplicates and rolls back failed inserts',async()=>{
 const db=new PGlite(); const user=id(1),org=id(2),trial=id(3),session=id(4);
 try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
   create table auth.users(id uuid primary key);
   create table myops_organizations(id uuid primary key,owner_user_id uuid);
   create table myops_memberships(user_id uuid,organization_id uuid,status text,role text);
   create table myops_trials(id uuid primary key,user_id uuid,organization_id uuid,started_at timestamptz,expires_at timestamptz,status text,policy_version int);
   create table mock_session(id uuid,user_id uuid,active boolean);
   create function public.myops_validate_app_session(uuid,text,text,boolean) returns jsonb language sql as $$ select jsonb_build_object('user_id',user_id,'active',active) from mock_session where id=$1 $$;
   create schema storage;
   create table storage.buckets(id text primary key, public boolean not null);
   create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets, name text not null);
   insert into storage.buckets values ('opsrental-private',false);
   set myops.allow_rental_staging='wengxxiqwtosirealghx';`);
  await db.exec(await readFile(new URL('../supabase/proposals/20261121104119_rental_staging_foundation.sql',import.meta.url),'utf8'));
  await db.query('insert into auth.users values ($1)',[user]);
  await db.query('insert into myops_organizations values ($1,$2)',[org,user]);
  await db.query("insert into myops_memberships values ($1,$2,'active','admin')",[user,org]);
  await db.query("insert into myops_trials values ($1,$2,$3,now()-interval '1 hour',now()+interval '167 hours','active',1)",[trial,user,org]);
  await db.query('insert into mock_session values ($1,$2,true)',[session,user]);
  await db.exec(await readFile(new URL('../supabase/proposals/rental_trial_atomic.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/proposals/rental_document_management.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/proposals/rental_trial_upload.sql',import.meta.url),'utf8'));
  await assert.rejects(db.query('select myops_rental_trial_create($1,$2,$3,$4,$5::jsonb)',[session,id(999),id(50),'properties',JSON.stringify({name:'Synthetic',address:'Example'})]),/Organization denied/);
  const create=async(n,body={name:'Synthetic',address:'Example'})=>(await db.query('select myops_rental_trial_create($1,$2,$3,$4,$5::jsonb) as v',[session,org,id(n),'properties',JSON.stringify(body)])).rows[0].v;
  const first=await create(10); assert.equal(first.used,1);
  assert.equal((await create(10)).item.id,first.item.id);
  assert.equal((await create(10)).replayed,true);
  await assert.rejects(create(10,{name:'changed',address:'Example'}),/Operation conflict/);
  await assert.rejects(create(11,{name:'',address:'Example'}),/check constraint/);
  const rpc=async(n,kind,body)=>(await db.query('select myops_rental_trial_create($1,$2,$3,$4,$5::jsonb) as v',[session,org,id(n),kind,JSON.stringify(body)])).rows[0].v;
  const lease=await rpc(12,'leases',{property_id:first.item.id,tenant_user_id:user,monthly_rent:100,start_date:'2026-01-01'}); assert.equal(lease.used,2);
  assert.equal((await rpc(13,'payments',{lease_id:lease.item.id,amount:5,due_date:'2026-01-02'})).used,3);
  assert.equal((await rpc(14,'tickets',{lease_id:lease.item.id,title:'Synthetic'})).used,4);
  for(let i=15;i<40;i++) assert.equal((await create(i)).used,i-10);
  const upload=async(finalize=false,digest='a'.repeat(64))=>(await db.query(
   'select myops_rental_trial_upload($1,$2,$3,$4,$5,null,$6,$7) as v',
   [session,org,id(40),'synthetic.pdf',first.item.id,digest,finalize]
  )).rows[0].v;
  const reservation=await upload();
  assert.equal(reservation.status,'uploading');
  assert.deepEqual(await upload(),reservation);
  await assert.rejects(upload(true),/Private storage object missing/);
  await assert.rejects(upload(false,'b'.repeat(64)),/Operation conflict/);
  assert.equal((await db.query('select state from rental_documents where id=$1',[reservation.document_id])).rows[0].state,'pending');
  assert.equal((await create(99)).error,'trial_limit_reached');
  await db.query("insert into storage.objects(bucket_id,name) values ('opsrental-private',$1)",[reservation.storage_path]);
  const completed=await upload(true);
  assert.equal(completed.status,'completed');
  assert.equal(completed.item.state,'ready');
  assert.equal((await upload(true)).replayed,true);
  assert.equal((await upload()).item.id,reservation.document_id);
  assert.equal((await create(99)).error,'trial_limit_reached');
  assert.equal((await db.query('select count(*)::int n from rental_properties')).rows[0].n,26);
  assert.equal((await db.query('select count(*)::int n from myops_rental_trial_operations')).rows[0].n,30);
  await db.query("update myops_trials set status='expired' where id=$1",[trial]);
  await assert.rejects(create(100),/Trial inactive/);
  await db.query("update myops_trials set status='active' where id=$1",[trial]);
  await db.query("update myops_trials set started_at=now()-interval '168 hours', expires_at=now() where id=$1",[trial]);
  await assert.rejects(create(102),/Trial inactive/);
  await db.query("update myops_trials set started_at=now()-interval '1 hour', expires_at=now()+interval '167 hours' where id=$1",[trial]);
  await db.query('update mock_session set active=false where id=$1',[session]);
  await assert.rejects(create(101),/Session denied/);
 } finally {await db.close();}
});
