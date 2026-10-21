-- MAJOBELLA · Tareas automáticas
-- Recordatorios, reseñas, retoques, cumpleaños, lista de espera y aviso de transferencias sin revisar.
-- pg_cron llama a la API cada hora (pg_net hace la llamada HTTP). La propia API crea o actualiza
-- el trabajo "majobella-tareas" la primera vez que se abre el panel, con su dirección y su clave.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- La API usa esta función para programar (o reprogramar) la tarea sin exponer pg_cron a nadie más.
create or replace function public.majobella_programar_tareas(url text, clave text)
returns void language plpgsql security definer set search_path = public, cron as $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'majobella-tareas';
  perform cron.schedule('majobella-tareas', '7 * * * *', format(
    $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-key', %L), body := '{"action":"cron"}'::jsonb, timeout_milliseconds := 60000)$cmd$,
    url, clave));
end $$;
revoke all on function public.majobella_programar_tareas(text, text) from public, anon, authenticated;

create or replace function public.majobella_tareas_programadas() returns boolean language sql security definer set search_path = public, cron as $$
  select exists (select 1 from cron.job where jobname = 'majobella-tareas' and active);
$$;
revoke all on function public.majobella_tareas_programadas() from public, anon, authenticated;
