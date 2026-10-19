-- Logística y el precio de venta; marca "Urgente" (pedido del 2026-10-19).
--   * Logística ve y edita el precio de venta de cada pieza (también con motivo, si la
--     orden de Shopify ya existe: `change_piece_price`). Sigue sin ver totales, pagos,
--     márgenes ni el PDF de la guía.
--   * Logística pasa piezas de Consulta a Espera respuesta cliente.
--   * Admin, ventas y logística marcan o quitan "Urgente" a las piezas
--     (`set_pieces_urgent`).
-- Logística no tiene UPDATE (RLS) sobre `pieces`: el precio y la marca se guardan por
-- RPC security definer, solo en piezas de guías activas (como sus demás acciones). La
-- actualización pasa por la tabla, así que los guards y la auditoría siguen aplicando.

-- 1. Consulta → Espera respuesta cliente: también logística (la tabla y
--    `PIECE_TRANSITIONS` deben ser idénticas). `change_piece_status` ya valida el rol con
--    esta tabla y deja a logística solo en guías activas.
alter table public.piece_status_transitions disable trigger audit_changes;
update public.piece_status_transitions
set roles = '{admin,ventas,logistica}'
where from_status = 'en_consulta' and to_status = 'en_espera';
alter table public.piece_status_transitions enable trigger audit_changes;

-- 2. El precio de venta lo asignan el admin y logística.
create or replace function private.guard_piece_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.price is null)
     or (tg_op = 'UPDATE' and new.price is not distinct from old.price) then
    return new;
  end if;
  -- Copia del precio cotizado por WhatsApp, cambio de precio con la orden creada y
  -- precios vaciados al cambiar el tipo de guía.
  if coalesce(current_setting('app.quote_copy_price', true), '') = 'on'
     or coalesce(current_setting('app.shopify_order_edit', true), '') = 'on'
     or (new.price is null and coalesce(current_setting('app.restoration_kind_change', true), '') = 'on') then
    return new;
  end if;
  -- Se exige en las peticiones de usuarios (rol `authenticated`, también dentro de
  -- funciones security definer). La clave secreta y el mantenimiento no pasan por aquí.
  -- (Dos IF: la clave secreta no puede ejecutar private.has_role.)
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if not private.has_role('{admin,logistica}') then
    raise exception 'Solo el administrador y logística asignan el precio de venta.' using errcode = '42501';
  end if;
  return new;
end;
$$;

comment on column public.pieces.price is
  'Precio de venta. Null: sin asignar; lo asignan el admin y logística (por set_piece_sale_price).';

-- 3. Asignar o cambiar el precio de venta (sin la orden de Shopify, o una pieza que aún
--    no tiene precio): admin y logística. Logística no tiene UPDATE sobre `pieces`, así
--    que va por esta RPC. Los guards de la pieza siguen aplicando: con la orden creada
--    un precio asignado se cambia con `change_piece_price`; una pieza cerrada no se
--    edita; una guía interna u observada no lleva precio. Devuelve la restauración.
create function public.set_piece_sale_price(p_piece_id uuid, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Solo el administrador y logística asignan el precio de venta.' using errcode = '42501';
  end if;
  if p_price is not null
     and (p_price < 0 or round(p_price, 2) <> p_price or p_price >= 10000000000) then
    raise exception 'Ingresa un monto válido (hasta 2 decimales).' using errcode = '22023';
  end if;

  -- Logística, solo en guías activas (D24); el admin, en cualquiera.
  select p.* into v_piece
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = p_piece_id
    and ((select private.has_role('{admin}')) or not private.is_past_restoration(r.id, r.status))
  for update of p;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;

  update public.pieces p set price = p_price
  where p.id = p_piece_id and p.price is distinct from p_price;
  return v_piece.restoration_id;
end;
$$;

revoke execute on function public.set_piece_sale_price(uuid, numeric) from public, anon;
grant execute on function public.set_piece_sale_price(uuid, numeric) to authenticated;

-- 4. Cambio de precio con la orden creada (P12): admin y logística (en guías activas),
--    con motivo. Queda en el historial de la pieza (el motivo) y en la auditoría.
create or replace function public.change_piece_price(
  p_piece_id uuid,
  p_price numeric,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_piece public.pieces;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Solo el administrador y logística cambian el precio con la orden creada.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Escribe el motivo del cambio de precio.' using errcode = '23514';
  end if;
  if length(v_reason) > 1000 then
    raise exception 'El motivo tiene más de 1000 caracteres' using errcode = '22023';
  end if;
  if p_price is null or p_price < 0 or round(p_price, 2) <> p_price then
    raise exception 'Ingresa un precio válido (hasta 2 decimales).' using errcode = '22023';
  end if;

  select p.* into v_piece
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.id = p_piece_id
    and ((select private.has_role('{admin}')) or not private.is_past_restoration(r.id, r.status))
  for update of p;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;
  if v_piece.price = p_price then
    return;
  end if;

  -- El guard de la pieza deja cambiar el precio con la orden creada solo por esta vía.
  perform set_config('app.shopify_order_edit', 'on', true);
  update public.pieces p set price = p_price where p.id = p_piece_id
  returning * into v_piece;
  perform set_config('app.shopify_order_edit', '', true);

  perform private.add_status_history(v_piece, v_piece.status, v_piece.status, v_reason, 'cambio_precio');
end;
$$;

revoke execute on function public.change_piece_price(uuid, numeric, text) from public, anon;
grant execute on function public.change_piece_price(uuid, numeric, text) to authenticated;

-- 5. La vista operativa expone el precio de venta a admin, ventas y logística (todos
--    los roles activos; el case deja la regla escrita). Al final: `create or replace`
--    solo agrega columnas al final.
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids,
  p.observed_at, p.quantity, p.service_ids,
  case when (select private.has_role('{admin,ventas,logistica}')) then p.price end as price
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

comment on view public.pieces_operational is
  'Piezas con el precio de venta de cada una, sin totales ni pagos (P42). Logística no ve las de restauraciones pasadas (D24, P48).';

-- 6. Vista de piezas: logística ve el precio de venta. Mismos parámetros y columnas.
create or replace function public.list_pieces_board(
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
  p_restoration_code text default null,
  p_no_workshop boolean default false
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
  service_cost numeric,
  price numeric,
  has_order boolean,
  photo_path text,
  review_sent_at timestamptz,
  review_returned_at timestamptz,
  quantity integer,
  location_since timestamptz,
  observed_at timestamptz,
  last_sent_at timestamptz,
  last_returned_at timestamptz,
  first_sent_at timestamptz,
  to_return boolean,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with pieces_today as (
    select p.*,
      -- Entregada (o devuelta al cliente) hoy, en hora de Lima.
      (
        (p.status = 'entregada' and p.delivered_at is not null
          and (p.delivered_at at time zone 'America/Lima')::date = private.lima_today())
        or (p.status in ('rechazada', 'sin_arreglo') and p.returned_at is not null
          and (p.returned_at at time zone 'America/Lima')::date = private.lima_today())
      ) as finished_today,
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return
    from public.pieces p
  ),
  base as (
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name,
      r.shopify_order_id is not null as has_order
    from pieces_today p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      and p.status <> 'anulada'
      and (p.status <> 'entregada' or p.finished_today)
      and (
        not (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
        or p.finished_today
      )
      and (
        not private.is_past_restoration(r.id, r.status)
        or (p.finished_today and private.has_role('{admin,ventas}'))
      )
      and (p_location is null or p.location = p_location)
      and (p_status is null or p.status = p_status)
      and (p_workshop_id is null or p.workshop_id = p_workshop_id)
      and (not coalesce(p_no_workshop, false) or p.workshop_id is null)
      and (not coalesce(p_urgent, false) or p.urgent)
      -- Listas: para entregar o para devolver al cliente.
      and (not coalesce(p_ready, false) or p.ready_for_delivery or p.to_return)
      and (not coalesce(p_to_return, false) or p.to_return)
      and (
        nullif(trim(p_query), '') is null
        or p.code ilike '%' || trim(p_query) || '%'
        or p.description ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
      )
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
  )
  select e.id, e.code, e.restoration_id, e.restoration_code, e.client_name, e.description,
    e.service_name, e.material_name, e.measure, e.weight_grams,
    e.status, e.location, e.urgent, e.ready_for_delivery, e.workshop_id, e.workshop_name,
    e.arrived_at, e.workshop_days, e.workshop_ongoing, e.last_observation,
    case when private.has_role('{admin,logistica}') then e.service_cost end,
    case when private.has_role('{admin,ventas,logistica}') then e.price end,
    e.has_order,
    (select f.path from public.restoration_files f
     where f.piece_id = e.id and f.category = 'antes'
       and f.mime_type in ('image/jpeg', 'image/png', 'image/webp')
     order by f.created_at, f.id limit 1),
    e.review_sent_at, e.review_returned_at,
    e.quantity,
    public.piece_location_since(e.location, e.status, e.created_at, e.arrived_at, e.observed_at,
      e.last_sent_at, e.last_returned_at, e.review_sent_at, e.review_returned_at, e.delivered_at,
      e.returned_at, e.cancelled_at),
    e.observed_at, e.last_sent_at, e.last_returned_at, e.first_sent_at,
    e.to_return,
    count(*) over ()
  from enriched e
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
  -- Las entregadas hoy, al final: ya no requieren trabajo.
  order by e.finished_today, e.urgent desc, e.workshop_ongoing desc, e.workshop_days desc,
    e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text, boolean) to authenticated;
-- 7. Historial de piezas: logística ve el precio de venta. Mismos parámetros y columnas.
create or replace function public.list_pieces_history(
  p_query text default null,
  p_restoration_code text default null,
  p_status public.piece_status default null,
  p_workshop_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 50,
  p_offset integer default 0
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
  workshop_id uuid,
  workshop_name text,
  finished_at timestamptz,
  service_cost numeric,
  price numeric,
  photo_path text,
  quantity integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with finished as (
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name,
      coalesce(
        case p.status
          when 'entregada' then p.delivered_at
          when 'anulada' then p.cancelled_at
          else p.returned_at
        end,
        (select max(h.occurred_at) from public.piece_status_history h
         where h.piece_id = p.id and h.to_status = p.status),
        p.updated_at
      ) as finished_at
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      -- Logística no ve restauraciones pasadas (D24).
      and (private.has_role('{admin,ventas}') or not private.is_past_restoration(r.id, r.status))
      -- Terminadas: lo que la vista de piezas ya no muestra como en curso.
      and (
        p.status in ('entregada', 'anulada')
        or (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
      )
      and (p_status is null or p.status = p_status)
      and (p_workshop_id is null or p.workshop_id = p_workshop_id)
      and (
        nullif(trim(p_query), '') is null
        or p.code ilike '%' || trim(p_query) || '%'
        or p.description ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
      )
      and (
        nullif(regexp_replace(coalesce(p_restoration_code, ''), '\D', '', 'g'), '') is null
        or ltrim(regexp_replace(r.code, '\D', '', 'g'), '0')
          = ltrim(regexp_replace(p_restoration_code, '\D', '', 'g'), '0')
      )
  )
  select f.id, f.code, f.restoration_id, f.restoration_code, f.client_name, f.description,
    f.service_name, f.material_name, f.measure, f.weight_grams,
    f.status, f.location, f.urgent, f.workshop_id, f.workshop_name, f.finished_at,
    case when private.has_role('{admin,logistica}') then f.service_cost end,
    case when private.has_role('{admin,ventas,logistica}') then f.price end,
    (select rf.path from public.restoration_files rf
     where rf.piece_id = f.id and rf.category = 'antes'
       and rf.mime_type in ('image/jpeg', 'image/png', 'image/webp')
     order by rf.created_at, rf.id limit 1),
    f.quantity,
    count(*) over ()
  from finished f
  where (p_from is null or (f.finished_at at time zone 'America/Lima')::date >= p_from)
    and (p_to is null or (f.finished_at at time zone 'America/Lima')::date <= p_to)
  order by f.finished_at desc, f.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_history(text, text, public.piece_status, uuid, date, date,
  integer, integer) from public, anon;
grant execute on function public.list_pieces_history(text, text, public.piece_status, uuid, date, date,
  integer, integer) to authenticated;
-- 8. Marcar o quitar "Urgente" (admin, ventas y logística). Logística, solo en piezas
--    de guías activas. Las piezas cerradas o entregadas no cambian (guard_piece_edit no
--    lo deja): se omiten; si no queda ninguna, error. Devuelve las piezas que quedaron
--    con la marca pedida.
create function public.set_pieces_urgent(p_piece_ids uuid[], p_urgent boolean)
returns table (piece_id uuid, urgent boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_found integer;
  v_open integer;
begin
  if v_role is null or v_role not in ('admin', 'ventas', 'logistica') then
    raise exception 'Tu rol no puede marcar piezas como urgentes.' using errcode = '42501';
  end if;
  if p_piece_ids is null or cardinality(p_piece_ids) = 0 then
    raise exception 'Elige al menos una pieza' using errcode = '22023';
  end if;
  if p_urgent is null then
    raise exception 'Indica si la pieza es urgente' using errcode = '22023';
  end if;

  if v_role = 'logistica' and exists (
    select 1 from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    where p.id = any (p_piece_ids) and private.is_past_restoration(r.id, r.status)
  ) then
    raise exception 'Tu rol no puede marcar piezas de restauraciones pasadas.' using errcode = '42501';
  end if;

  select count(*), count(*) filter (
      where p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
    )
  into v_found, v_open
  from public.pieces p
  where p.id = any (p_piece_ids);
  if v_found = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
  if v_open = 0 then
    raise exception 'Una pieza cerrada o entregada no se marca como urgente.' using errcode = '23514';
  end if;

  -- Por la tabla: guards, `updated_at` y auditoría siguen aplicando.
  update public.pieces p set urgent = p_urgent
  where p.id = any (p_piece_ids)
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
    and p.urgent is distinct from p_urgent;

  return query
  select p.id, p.urgent
  from public.pieces p
  where p.id = any (p_piece_ids)
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
  order by p.id;
end;
$$;

revoke execute on function public.set_pieces_urgent(uuid[], boolean) from public, anon;
grant execute on function public.set_pieces_urgent(uuid[], boolean) to authenticated;
