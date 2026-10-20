-- Solo para pruebas locales: lo mínimo de Supabase que usa la migración
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint);
-- pg_cron no existe en local: estas dos funciones imitan las de la migración de tareas
create table if not exists public._cron_stub (url text, clave text);
create or replace function public.majobella_programar_tareas(url text, clave text) returns void language sql as $$ delete from public._cron_stub; insert into public._cron_stub values (url, clave); $$;
create or replace function public.majobella_tareas_programadas() returns boolean language sql as $$ select exists (select 1 from public._cron_stub) $$;
