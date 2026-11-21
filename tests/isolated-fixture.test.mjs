import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('synthetic fixture is self-contained and enforces organization association',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create schema auth; create table auth.users(id uuid primary key); create table public.myops_organizations(id uuid primary key)');
  const triggers=async()=> (await db.query("select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where (n.nspname='auth' and c.relname='users') or (n.nspname='public' and c.relname='myops_organizations')")).rows[0].n;
  const before=await triggers(); await db.exec(await readFile(new URL('./fixtures/opsrental-test-schema.sql',import.meta.url),'utf8')); assert.equal(await triggers(),before);
  const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
  await db.query('insert into opsrental_test.organizations values ($1),($2)',[id(1),id(2)]);await db.query('insert into opsrental_test.users values ($1)',[id(3)]);
  await db.query('insert into opsrental_test.properties values ($1,$2)',[id(4),id(1)]);
  await db.query('insert into opsrental_test.tenancies values ($1,$2,$3,$4)',[id(5),id(1),id(4),id(3)]);
  const insert='insert into opsrental_test.documents values ($1,$2,$3,$4,$5,$6,$7)';
  await db.query(insert,[id(6),id(1),null,id(5),id(3),'a','ready']);
  await assert.rejects(db.query(insert,[id(7),id(2),null,id(5),id(3),'b','ready']),/foreign key/);
  await assert.rejects(db.query(insert,[id(8),id(2),id(4),null,id(3),'c','ready']),/foreign key/);
 } finally {await db.close();}
});
