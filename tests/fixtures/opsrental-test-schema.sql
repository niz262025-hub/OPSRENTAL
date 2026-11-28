-- TEST FIXTURE ONLY. Execute in an ephemeral local PostgreSQL database.
-- Never apply this fixture to a hosted or production project.
create schema opsrental_test;
create table opsrental_test.users(id uuid primary key);
create table opsrental_test.organizations(id uuid primary key);
create table opsrental_test.memberships(
 user_id uuid not null references opsrental_test.users(id),
 organization_id uuid not null references opsrental_test.organizations(id),
 role text not null check(role in ('owner','admin','manager','tenant')),
 active boolean not null default true, primary key(user_id,organization_id));
create table opsrental_test.sessions(
 id uuid primary key, user_id uuid not null references opsrental_test.users(id),
 revoked boolean not null default false, entitled boolean not null default true);
create table opsrental_test.properties(
 id uuid primary key, organization_id uuid not null references opsrental_test.organizations(id),
 unique(id,organization_id));
create table opsrental_test.tenancies(
 id uuid primary key, organization_id uuid not null, property_id uuid not null,
 tenant_user_id uuid not null references opsrental_test.users(id), unique(id,organization_id),
 foreign key(property_id,organization_id) references opsrental_test.properties(id,organization_id));
create table opsrental_test.documents(
 id uuid primary key, organization_id uuid not null, property_id uuid, tenancy_id uuid,
 uploaded_by uuid not null references opsrental_test.users(id), storage_path text not null unique,
 state text not null check(state in ('pending','ready','deleting')),
 check ((property_id is null) <> (tenancy_id is null)),
 foreign key(property_id,organization_id) references opsrental_test.properties(id,organization_id),
 foreign key(tenancy_id,organization_id) references opsrental_test.tenancies(id,organization_id));
revoke all on schema opsrental_test from public;
