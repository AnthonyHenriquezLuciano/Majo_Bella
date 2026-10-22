-- Estados editoriales: las opciones en borrador/desactivadas no son reservables.
alter table public.categorias add column if not exists estado text not null default 'activo';
alter table public.servicios add column if not exists estado text not null default 'activo';
update public.categorias set estado = case when activo then 'activo' else 'desactivado' end
where estado = 'activo' and activo = false;
update public.servicios set estado = case when activo then 'activo' else 'desactivado' end
where estado = 'activo' and activo = false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categorias_estado_valido') then
    alter table public.categorias add constraint categorias_estado_valido check (estado in ('activo', 'desactivado', 'borrador'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'servicios_estado_valido') then
    alter table public.servicios add constraint servicios_estado_valido check (estado in ('activo', 'desactivado', 'borrador'));
  end if;
end $$;
