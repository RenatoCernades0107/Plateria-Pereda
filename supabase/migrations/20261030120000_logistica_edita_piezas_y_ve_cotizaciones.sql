-- Logística (pedido del 2026-10-30):
--   * Edita los datos de una pieza desde el detalle de la guía (los mismos campos que el
--     admin: descripción, cantidad, medidas, peso, materiales, servicios, notas, urgente,
--     taller y precio de venta). No edita los datos de la guía ni agrega piezas.
--   * Exporta la versión para taller del PDF de la guía, que lleva el nombre del cliente
--     (sin documento, contacto, teléfono ni precios).
--   * Ve las cotizaciones del cotizador (solo lectura).
-- Logística sigue sin UPDATE (RLS) sobre `pieces` ni SELECT sobre `clients`: la edición
-- y el nombre del cliente van por RPC security definer, solo en guías activas (D24). La
-- actualización pasa por la tabla, así que los guards y la auditoría siguen aplicando.

-- 1. Editar una pieza (logística). Mismas columnas que la edición directa de la app;
--    el precio y el taller solo se escriben si se piden (`p_set_price`,
--    `p_set_workshop`). Devuelve la restauración de la pieza.
create function public.update_piece_as_logistics(
  p_piece_id uuid,
  p_quantity integer,
  p_description text,
  p_measure text,
  p_material_ids uuid[],
  p_service_ids uuid[],
  p_weight_grams numeric,
  p_notes text,
  p_urgent boolean,
  p_estimated_delivery_date date,
  p_set_workshop boolean default false,
  p_workshop_id uuid default null,
  p_workshop_delivery_date date default null,
  p_set_price boolean default false,
  p_price numeric default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
begin
  if not (select private.has_role('{logistica}')) then
    raise exception 'Solo logística edita la pieza por esta vía.' using errcode = '42501';
  end if;
  if p_set_price and p_price is not null
     and (p_price < 0 or round(p_price, 2) <> p_price or p_price >= 10000000000) then
    raise exception 'Ingresa un monto válido (hasta 2 decimales).' using errcode = '22023';
  end if;
  if p_set_workshop and p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;

  -- Solo en guías activas (D24), como las demás acciones de logística.
  select p.* into v_piece
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = p_piece_id
    and not private.is_past_restoration(r.id, r.status)
  for update of p;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;

  update public.pieces p set
    quantity = p_quantity,
    description = p_description,
    measure = p_measure,
    material_ids = coalesce(p_material_ids, '{}'),
    service_ids = coalesce(p_service_ids, '{}'),
    weight_grams = p_weight_grams,
    notes = coalesce(p_notes, ''),
    urgent = coalesce(p_urgent, false),
    estimated_delivery_date = p_estimated_delivery_date,
    workshop_id = case when p_set_workshop then p_workshop_id else p.workshop_id end,
    workshop_delivery_date = case when p_set_workshop then p_workshop_delivery_date
      else p.workshop_delivery_date end,
    price = case when p_set_price then p_price else p.price end
  where p.id = p_piece_id;
  return v_piece.restoration_id;
end;
$$;

revoke execute on function public.update_piece_as_logistics(uuid, integer, text, text, uuid[],
  uuid[], numeric, text, boolean, date, boolean, uuid, date, boolean, numeric) from public, anon;
grant execute on function public.update_piece_as_logistics(uuid, integer, text, text, uuid[],
  uuid[], numeric, text, boolean, date, boolean, uuid, date, boolean, numeric) to authenticated;

-- 2. Los servicios de la pieza se eligen del catálogo: logística ya ve y asigna el
--    precio de venta, así que también lee los servicios (con su precio sugerido).
create policy "Logística lee los servicios"
  on public.services for select to authenticated
  using ((select private.has_role('{logistica}')));

-- 3. Nombre del cliente de una guía, para la versión para taller del PDF. Logística no
--    lee `clients`: solo recibe el nombre, y solo de guías activas (D24).
create function public.restoration_client_name(p_restoration_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.display_name
  from public.restorations r
  join public.clients c on c.id = r.client_id
  where r.id = p_restoration_id
    and private.current_app_role() is not null
    and (private.has_role('{admin,ventas}') or not private.is_past_restoration(r.id, r.status));
$$;

revoke execute on function public.restoration_client_name(uuid) from public, anon;
grant execute on function public.restoration_client_name(uuid) to authenticated;

-- 4. Cotizaciones: logística las lee (permiso cotizador.ver), sin crearlas ni editarlas.
--    El cliente sale de los datos copiados en la cotización (no lee `clients`).
create policy "Logística lee las cotizaciones"
  on public.quotes for select to authenticated
  using ((select private.has_role('{logistica}')));
create policy "Logística lee las líneas de las cotizaciones"
  on public.quote_items for select to authenticated
  using ((select private.has_role('{logistica}')));
