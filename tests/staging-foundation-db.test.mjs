import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('staging foundation rejects cross-tenant references and preserves data on reapplication', async () => {
  const db = new PGlite();
  const orgA = '00000000-0000-4000-8000-000000000001';
  const orgB = '00000000-0000-4000-8000-000000000002';
  const user = '00000000-0000-4000-8000-000000000003';
  const property = '00000000-0000-4000-8000-000000000004';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table public.myops_organizations(id uuid primary key);`);
    const sql = await readFile(new URL('../supabase/proposals/20261121104119_rental_staging_foundation.sql', import.meta.url), 'utf8');
    await assert.rejects(db.exec(sql), /Explicit isolated rental staging guard required/);
    await db.exec("set myops.allow_rental_staging='wengxxiqwtosirealghx'");
    await db.exec(sql);
    await db.query('insert into public.myops_organizations(id) values ($1), ($2)', [orgA, orgB]);
    await db.query('insert into auth.users(id) values ($1)', [user]);
    await db.query("insert into public.rental_properties(id,organization_id,name,address,created_by) values ($1,$2,'Synthetic','Test',$3)", [property,orgA,user]);
    await assert.rejects(db.query("insert into public.rental_leases(organization_id,property_id,tenant_user_id,monthly_rent,start_date) values ($1,$2,$3,1,'2026-01-01')", [orgB,property,user]), /foreign key/);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.rental_properties'), /permission denied/);
    await db.exec('reset role');
    await db.exec(sql);
    assert.equal((await db.query('select count(*)::int as n from public.rental_properties')).rows[0].n,1);
  } finally { await db.close(); }
});

test('staging foundation refuses pre-existing rental tables without modifying them', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table public.myops_organizations(id uuid primary key);
      create table public.rental_properties(id integer primary key);
      insert into public.rental_properties values (42);
      set myops.allow_rental_staging='wengxxiqwtosirealghx';`);
    const sql = await readFile(new URL('../supabase/proposals/20261121104119_rental_staging_foundation.sql', import.meta.url), 'utf8');
    await assert.rejects(db.exec(sql), /Existing rental objects require manual review/);
    assert.equal((await db.query('select id from public.rental_properties')).rows[0].id, 42);
    assert.equal((await db.query("select to_regclass('public.myops_rental_staging_foundation_marker') as marker")).rows[0].marker, null);
  } finally { await db.close(); }
});

test('access rollback is guarded, repeatable and preserves rows, constraints and RLS', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key);
      create table public.myops_organizations(id uuid primary key);
      set myops.allow_rental_staging='wengxxiqwtosirealghx';`);
    const foundation = await readFile(new URL('../supabase/proposals/20261121104119_rental_staging_foundation.sql', import.meta.url), 'utf8');
    const rollback = await readFile(new URL('../supabase/proposals/rental_staging_access_rollback.sql', import.meta.url), 'utf8');
    await db.exec(foundation);
    await db.exec(`insert into auth.users values ('00000000-0000-4000-8000-000000000001');
      insert into public.myops_organizations values ('00000000-0000-4000-8000-000000000002');
      insert into public.rental_properties(organization_id,name,address,created_by) values
      ('00000000-0000-4000-8000-000000000002','Synthetic','Test','00000000-0000-4000-8000-000000000001');
      grant select on public.rental_properties to authenticated;`);
    await db.exec("set myops.allow_rental_staging='wrong-project'");
    await assert.rejects(db.exec(rollback), /Explicit isolated rental staging guard required/);
    await db.exec("set myops.allow_rental_staging='wengxxiqwtosirealghx'");
    await db.exec(rollback); await db.exec(rollback);
    assert.equal((await db.query('select count(*)::int as n from public.rental_properties')).rows[0].n,1);
    const metadata=(await db.query("select relrowsecurity, (select count(*)::int from pg_constraint where conrelid='public.rental_properties'::regclass) as constraints from pg_class where oid='public.rental_properties'::regclass")).rows[0];
    assert.equal(metadata.relrowsecurity,true);assert.ok(metadata.constraints>0);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from public.rental_properties'), /permission denied/);
  } finally { await db.close(); }
});
