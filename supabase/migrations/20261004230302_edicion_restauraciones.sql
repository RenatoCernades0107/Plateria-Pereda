-- Edición de restauraciones y piezas (Paso 7.7, P12). Los permisos por rol y por
-- columna ya están en 20261004223122_restauraciones.sql; aquí se bloquea lo que
-- depende del estado:
--   * una pieza anulada no se edita; una entregada solo cambia sus notas;
--   * con la orden de Shopify creada, el precio solo cambia por el flujo de la orden
--     (Paso 9.2), que marca la transacción con app.shopify_order_edit = 'on';
--   * no se agregan piezas a restauraciones completadas o anuladas.

create or replace function private.guard_piece_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'anulada' and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.price, new.workshop_id, new.notes
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.price, old.workshop_id, old.notes
  ) then
    raise exception 'Una pieza anulada no se puede editar' using errcode = '23514';
  end if;

  if old.status = 'entregada' and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.price, new.workshop_id
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.price, old.workshop_id
  ) then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if new.price is distinct from old.price
     and coalesce(current_setting('app.shopify_order_edit', true), '') <> 'on'
     and exists (
       select 1 from public.restorations
       where id = new.restoration_id and shopify_order_id is not null
     ) then
    raise exception 'Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pieces_guard_edit
  before update on public.pieces
  for each row execute function private.guard_piece_edit();

create or replace function private.guard_piece_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.restorations
    where id = new.restoration_id and status in ('completada', 'anulada')
  ) then
    raise exception 'No se agregan piezas a una restauración completada o anulada'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- Corre antes que pieces_set_code (orden alfabético de los triggers BEFORE).
create trigger pieces_guard_insert
  before insert on public.pieces
  for each row execute function private.guard_piece_insert();
