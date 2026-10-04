-- Al crear un registro, el historial omite también las columnas con texto vacío
-- (p. ej., notas o dirección sin llenar), no solo las nulas.

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
    -- Al crear, se omiten las columnas vacías (null o texto vacío); al borrar, se guarda todo.
    and not (tg_op = 'INSERT' and (new_row -> key) in ('null'::jsonb, '""'::jsonb));

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
