\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key,email text unique);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb)$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
create table public.orders(id bigint generated always as identity primary key,created_at timestamptz not null default now(),data jsonb not null);
insert into public.orders(data) select jsonb_build_object('legacy',n,'opaque',md5(n::text)) from generate_series(1,33) n;
create schema test;
create table test.legacy_before as select count(*) row_count,md5(string_agg(id::text||':'||created_at::text||':'||data::text,'|' order by id)) checksum from public.orders;
alter table public.orders enable row level security;
create policy "allow all" on public.orders for all using(true) with check(true);
grant all on public.orders to anon,authenticated;
