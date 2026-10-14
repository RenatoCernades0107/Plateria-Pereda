-- Vista de piezas tipo hoja de cálculo (pedido del 2026-10-12, P55/D62).
--   * La tabla muestra primero la foto "Antes" de la pieza y sus datos principales,
--     para que logística ingrese el costo de servicio y el admin, viéndolo, ponga el
--     precio de venta.
--   * Montos según el rol, como en el resto del sistema: el costo de servicio solo lo
--     ven admin y logística (como en "Piezas del taller"); el precio de venta, admin y
--     ventas (logística no ve montos de venta, P42).
--   * Filtro por número de guía: "123", "RES-123" o "RES-00123" encuentran la RES-00123.

drop function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean);

create function public.list_pieces_board(
  p_query text default null,
  p_location public.piece_location default null,
  p_status public.piece_status default null,
  p_workshop_id uuid default null,
  p_min_workshop_days integer default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_urgent boolean default false,
  p_ready boolean default false,
  p_to_return boolean default false,
  p_restoration_code text default null
)
returns table (
  id uuid,
  code text,
  restoration_id uuid,
  restoration_code text,
  client_name text,
  description text,
  service_name text,
  material_name text,
  measure text,
  weight_grams numeric,
  status public.piece_status,
  location public.piece_location,
  urgent boolean,
  ready_for_delivery boolean,
  workshop_id uuid,
  workshop_name text,
  arrived_at timestamptz,
  workshop_days integer,
  workshop_ongoing boolean,
  last_observation text,
  -- Null si el rol no lo ve (o si aún no se define).
  service_cost numeric,
  price numeric,
  -- La restauración ya tiene orden de Shopify: un precio asignado se cambia con motivo.
  has_order boolean,
  -- Primera foto "Antes" de la pieza (ruta en el bucket restoration-files).
  photo_path text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name,
      r.shopify_order_id is not null as has_order,
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      and p.status not in ('entregada', 'anulada')
      and not (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
      and not private.is_past_restoration(r.id, r.status)
      and (p_location is null or p.location = p_location)
      and (p_status is null or p.status = p_status)
      and (p_workshop_id is null or p.workshop_id = p_workshop_id)
      and (not coalesce(p_urgent, false) or p.urgent)
      and (not coalesce(p_ready, false) or p.ready_for_delivery)
      and (
        nullif(trim(p_query), '') is null
        or p.code ilike '%' || trim(p_query) || '%'
        or p.description ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
      )
      -- Número de guía: se comparan solo los dígitos, sin ceros a la izquierda.
      and (
        nullif(regexp_replace(coalesce(p_restoration_code, ''), '\D', '', 'g'), '') is null
        or ltrim(regexp_replace(r.code, '\D', '', 'g'), '0')
          = ltrim(regexp_replace(p_restoration_code, '\D', '', 'g'), '0')
      )
  ),
  enriched as (
    select b.*, w.days as workshop_days, w.ongoing as workshop_ongoing,
      (select h.note from public.piece_status_history h
       where h.piece_id = b.id and h.event = 'estado' and h.to_status = 'observada'
       order by h.occurred_at desc, h.id desc limit 1) as last_observation
    from base b
    cross join lateral public.workshop_days(private.piece_history_json(b.id), now()) w
    where not coalesce(p_to_return, false) or b.to_return
  )
  select e.id, e.code, e.restoration_id, e.restoration_code, e.client_name, e.description,
    e.service_name, e.material_name, e.measure, e.weight_grams,
    e.status, e.location, e.urgent, e.ready_for_delivery, e.workshop_id, e.workshop_name,
    e.arrived_at, e.workshop_days, e.workshop_ongoing, e.last_observation,
    case when private.has_role('{admin,logistica}') then e.service_cost end,
    case when private.has_role('{admin,ventas}') then e.price end,
    e.has_order,
    (select f.path from public.restoration_files f
     where f.piece_id = e.id and f.category = 'antes'
       and f.mime_type in ('image/jpeg', 'image/png', 'image/webp')
     order by f.created_at, f.id limit 1),
    count(*) over ()
  from enriched e
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
  order by e.urgent desc, e.workshop_ongoing desc, e.workshop_days desc, e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text) to authenticated;

-- La primera foto "Antes" de cada pieza se busca por pieza, categoría y fecha.
create index restoration_files_piece_category_idx
  on public.restoration_files (piece_id, category, created_at)
  where piece_id is not null;

-- Detalle de la pieza (/piezas/[id]): su costo de servicio, solo para admin y
-- logística (logística, mientras ve la restauración, D24).
create function public.get_piece_service_cost(p_piece_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Tu rol no ve el costo de servicio.' using errcode = '42501';
  end if;
  return (
    select p.service_cost
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where p.id = p_piece_id
      and ((select private.has_role('{admin}')) or not private.is_past_restoration(r.id, r.status))
  );
end;
$$;

revoke execute on function public.get_piece_service_cost(uuid) from public, anon;
grant execute on function public.get_piece_service_cost(uuid) to authenticated;
