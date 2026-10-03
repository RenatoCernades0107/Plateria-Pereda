-- Registro de auditoría: cada insert, update y delete de las tablas auditadas guarda una
-- fila con quién hizo el cambio y qué columnas cambiaron. Las filas no se pueden editar
-- ni borrar; solo el administrador puede leerlas.

create schema if not exists audit;
revoke all on schema audit from public;

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  -- Usuario que hizo el cambio; vacío cuando lo hizo el sistema (Shopify, tareas, semillas).
  actor_id uuid,
  -- Nombre del usuario en ese momento, para que el registro no dependa de su perfil actual.
  actor_name text,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  -- { "columna": { "old": valor anterior, "new": valor nuevo } }
  changes jsonb not null default '{}'
);

comment on table public.audit_log is
  'Historial de cambios de las tablas auditadas. Solo inserción; lo escribe audit.log_change().';

create index audit_log_entity_idx on public.audit_log (table_name, record_id, occurred_at desc);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, occurred_at desc);

-- Trigger AFTER de cada tabla auditada. Sus argumentos son columnas que no se registran
-- (además de id, created_at y updated_at). Un update que no cambia nada no deja registro.
create or replace function audit.log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ignored text[] := array['id', 'created_at', 'updated_at'] || tg_argv;
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  diff jsonb;
  actor uuid := auth.uid();
begin
  select coalesce(
    jsonb_object_agg(
      key,
      jsonb_build_object('old', old_row -> key, 'new', new_row -> key)
    ),
    '{}'
  )
  into diff
  from jsonb_object_keys(coalesce(new_row, old_row)) as key
  where key <> all (ignored)
    and (old_row -> key) is distinct from (new_row -> key)
    -- Al crear, se omiten las columnas vacías; al borrar, se guarda todo lo que había.
    and not (tg_op = 'INSERT' and jsonb_typeof(new_row -> key) = 'null');

  if tg_op = 'UPDATE' and diff = '{}' then
    return null;
  end if;

  insert into public.audit_log (actor_id, actor_name, table_name, record_id, action, changes)
  values (
    actor,
    (select full_name from public.profiles where id = actor),
    tg_table_name,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    lower(tg_op),
    diff
  );
  return null;
end;
$$;

-- Activa la auditoría en una tabla. Uso: select audit.enable('public.tabla', '{columna_ignorada}');
create or replace function audit.enable(target regclass, ignored_columns text[] default '{}')
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format(
    'create or replace trigger audit_changes
       after insert or update or delete on %s
       for each row execute function audit.log_change(%s)',
    target,
    (select string_agg(quote_literal(c), ', ') from unnest(ignored_columns) as c)
  );
end;
$$;

comment on function audit.enable(regclass, text[]) is
  'Crea el trigger audit_changes en la tabla indicada; ignored_columns no se registran.';

-- Nadie puede modificar el historial, ni siquiera con la clave secreta.
create or replace function audit.prevent_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El registro de auditoría no se puede modificar ni borrar'
    using errcode = '42501';
end;
$$;

create trigger audit_log_immutable
  before update or delete on public.audit_log
  for each row execute function audit.prevent_changes();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function audit.prevent_changes();

revoke execute on all functions in schema audit from public, anon, authenticated;
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;

alter table public.audit_log enable row level security;

create policy "Solo admin lee la auditoría"
  on public.audit_log for select
  to authenticated
  using ((select private.has_role('{admin}')));

-- Tablas auditadas
select audit.enable('public.profiles');
