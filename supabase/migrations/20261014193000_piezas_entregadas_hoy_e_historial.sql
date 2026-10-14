-- Vista de piezas: las entregadas hoy siguen a la vista e historial de piezas
-- (pedido del 2026-10-14).
--   * `list_pieces_board` también muestra las piezas entregadas (o devueltas al
--     cliente, si se rechazaron o no tenían arreglo) HOY, en hora de Lima. Desde el día
--     siguiente solo salen en el historial. Van al final de la lista.
--     Logística no ve restauraciones pasadas (D24): si la restauración ya se cerró, sus
--     piezas entregadas hoy solo las ven admin y ventas.
--   * `list_pieces_history`: piezas terminadas (entregadas, anuladas, rechazadas o sin
--     arreglo que ya no están por devolver) con filtros de texto, guía, estado, taller
--     y rango de fechas de entrega o cierre. Mismas reglas de montos que la vista.

-- 1. Vista de piezas: mismas columnas y firma; cambia qué piezas entran y el orden.
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
  service_cost numeric,
  price numeric,
  has_order boolean,
  photo_path text,
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
      ) as finished_today
    from public.pieces p
  ),
  base as (
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name,
      r.shopify_order_id is not null as has_order,
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return
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
      and (not coalesce(p_urgent, false) or p.urgent)
      and (not coalesce(p_ready, false) or p.ready_for_delivery)
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
  -- Las entregadas hoy, al final: ya no requieren trabajo.
  order by e.finished_today, e.urgent desc, e.workshop_ongoing desc, e.workshop_days desc,
    e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

-- 2. Historial de piezas terminadas.
create function public.list_pieces_history(
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
  -- Cuándo se entregó, devolvió o anuló (o, si falta, su último cambio de estado).
  finished_at timestamptz,
  -- Null si el rol no lo ve (o si no se definió).
  service_cost numeric,
  price numeric,
  photo_path text,
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
    case when private.has_role('{admin,ventas}') then f.price end,
    (select rf.path from public.restoration_files rf
     where rf.piece_id = f.id and rf.category = 'antes'
       and rf.mime_type in ('image/jpeg', 'image/png', 'image/webp')
     order by rf.created_at, rf.id limit 1),
    count(*) over ()
  from finished f
  where (p_from is null or (f.finished_at at time zone 'America/Lima')::date >= p_from)
    and (p_to is null or (f.finished_at at time zone 'America/Lima')::date <= p_to)
  order by f.finished_at desc, f.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_history(text, text, public.piece_status, uuid,
  date, date, integer, integer) from public, anon;
grant execute on function public.list_pieces_history(text, text, public.piece_status, uuid,
  date, date, integer, integer) to authenticated;
