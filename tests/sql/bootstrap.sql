\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create role supabase_auth_admin nologin;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null, file_size_limit bigint);
grant usage on schema public to service_role;
