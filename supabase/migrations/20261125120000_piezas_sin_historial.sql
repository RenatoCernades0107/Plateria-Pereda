-- Piezas: sin historial aparte. La vista de piezas lista todas (las terminadas al final),
-- con rango de fechas por registro o por entrega y tope mayor para exportar a CSV.
-- `p_active_only` conserva el comportamiento anterior para el kanban sin filtros.
-- Las funciones de historial desaparecen: ya no hay página de historial.
-- Parte de la versión de 20261124160000 (falta asignar y listas por cobrar).

drop function public.list_pieces_board(text, public.piece_location[], public.piece_status[], uuid[], integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text, text[], boolean);
drop function public.list_pieces_history(text, text, public.piece_status[], uuid[], date, date, integer, integer);

create function public.list_pieces_board(
  p_query text default null,
  p_location public.piece_location[] default null,
  p_status public.piece_status[] default null,
  p_workshop_ids uuid[] default null,
  p_min_workshop_days integer default null,
  p_limit integer default 50,
  p_offset integer default 0,
  p_urgent boolean default false,
  p_ready boolean default false,
  p_to_return boolean default false,
  p_restoration_code text default null,
  p_no_workshop boolean default false,
  p_sort text default 'guia',
  p_dir text default 'desc',
  p_missing text[] default null,
  p_to_collect boolean default false,
  p_from date default null,
  p_to date default null,
  p_date_field text default 'registro',
  p_active_only boolean default false
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
  estimated_delivery_date date,
  workshop_delivery_date date,
  registered_at timestamptz,
  finished_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with today as materialized (
    select private.lima_today() as d
  ),
  pieces_today as materialized (
    select p.*,
      -- Entregada (o devuelta al cliente) hoy, en hora de Lima.
      (
        (p.status = 'entregada' and p.delivered_at is not null
          and (p.delivered_at at time zone 'America/Lima')::date = t.d)
        or (p.status in ('rechazada', 'sin_arreglo') and p.returned_at is not null
          and (p.returned_at at time zone 'America/Lima')::date = t.d)
      ) as finished_today,
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return,
      -- Terminada: ya no requiere trabajo (entregada, anulada o rechazada ya devuelta).
      (
        p.status in ('entregada', 'anulada')
        or (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
      ) as is_finished,
      -- Cuándo se entregó, devolvió o anuló; null si sigue en curso.
      case
        when p.status in ('entregada', 'anulada')
          or (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
        then coalesce(
          case p.status
            when 'entregada' then p.delivered_at
            when 'anulada' then p.cancelled_at
            else p.returned_at
          end,
          (select max(h.occurred_at) from public.piece_status_history h
           where h.piece_id = p.id and h.to_status = p.status),
          p.updated_at
        )
      end as finished_at
    from public.pieces p
    cross join today t
  ),
  base as (
    select p.*, r.code as restoration_code, r.created_at as restoration_created_at,
      c.display_name as client_name, w.name as workshop_name,
      r.shopify_order_id is not null as has_order
    from pieces_today p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      -- Solo en curso (el kanban sin filtros): sin anuladas y las entregadas o devueltas
      -- solo el día en que terminaron. Si no, salen todas, las terminadas al final.
      and (
        not coalesce(p_active_only, false)
        or (
          p.status <> 'anulada'
          and (p.status <> 'entregada' or p.finished_today)
          and (
            not (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
            or p.finished_today
          )
        )
      )
      -- Logística no ve restauraciones pasadas (D24). Solo una guía cerrada puede ser
      -- "pasada": el CASE evita llamar a la función (con su consulta) por cada pieza de
      -- las guías en curso.
      and (
        private.has_role('{admin,ventas}')
        or not case when r.status in ('completada', 'anulada', 'rechazada')
          then private.is_past_restoration(r.id, r.status) else false end
      )
      -- Rango de fechas (Lima), por fecha de registro o de entrega/cierre.
      and (
        p_from is null and p_to is null
        or (
          case when p_date_field = 'entrega'
            then (p.finished_at at time zone 'America/Lima')::date
            else (p.created_at at time zone 'America/Lima')::date
          end
        ) between coalesce(p_from, date '-infinity') and coalesce(p_to, date 'infinity')
      )
      and (coalesce(cardinality(p_location), 0) = 0 or p.location = any (p_location))
      and (coalesce(cardinality(p_status), 0) = 0 or p.status = any (p_status))
      -- Talleres elegidos y/o "sin taller": basta con cumplir uno.
      and (
        coalesce(cardinality(p_workshop_ids), 0) = 0 and not coalesce(p_no_workshop, false)
        or p.workshop_id = any (p_workshop_ids)
        or (coalesce(p_no_workshop, false) and p.workshop_id is null)
      )
      and (not coalesce(p_urgent, false) or p.urgent)
      -- Listas: para entregar o para devolver al cliente.
      and (not coalesce(p_ready, false) or p.ready_for_delivery or p.to_return)
      and (not coalesce(p_to_return, false) or p.to_return)
      -- Falta asignar: sin precio y/o sin costo de servicio (0 cuenta como asignado); basta
      -- con cumplir una opción. Cada rama solo para quien ve ese dato (como las columnas de
      -- salida): sin ello, ventas podría deducir qué piezas tienen costo.
      and (
        coalesce(cardinality(p_missing), 0) = 0
        or ('precio' = any (p_missing) and p.price is null
            and private.has_role('{admin,ventas,logistica}'))
        or ('costo' = any (p_missing) and p.service_cost is null
            and private.has_role('{admin,logistica}'))
      )
      -- Listas por cobrar: lista para entregar y su guía Normal aún debe dinero (pago
      -- pendiente o parcial y saldo > 0); es la misma cuenta del KPI del dashboard. Solo
      -- para quien ve los montos (como `dinero.ver`): sin ello, el filtro delataría qué
      -- guías no están pagadas.
      and (
        not coalesce(p_to_collect, false)
        or (p.ready_for_delivery and r.kind = 'normal'
            and r.payment_status in ('pendiente', 'parcial') and r.balance > 0
            and private.has_role('{admin,ventas}'))
      )
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
  -- Los días en taller salen del historial de cada pieza (caro): se calculan para todas
  -- solo si se filtra u ordena por ellos; si no, solo para la página que se muestra.
  enriched as (
    select b.*, (b.wd ->> 'days')::integer as workshop_days, (b.wd ->> 'ongoing')::boolean as workshop_ongoing
    from (
      select b.*,
        -- CASE: sin filtro ni orden por días, la función ni se llama.
        case when p_min_workshop_days is not null or p_sort = 'dias_taller' then
          (select to_jsonb(w) from public.workshop_days(private.piece_history_json(b.id), now()) w limit 1)
        end as wd
      from base b
    ) b
  ),
  page as (
    select x.* from (
    select e.*, count(*) over () as total_count,
      row_number() over (order by e.is_finished, e.finished_today,
          -- Guía: la más reciente (o la más antigua) y sus piezas en orden.
          case when o.s = 'guia' and o.d = 'asc' then e.restoration_created_at end asc,
          case when o.s = 'guia' and o.d = 'desc' then e.restoration_created_at end desc,
          case when o.s = 'guia' then e.number end asc,
          case when o.s = 'fecha' and o.d = 'asc' then e.created_at end asc,
          case when o.s = 'fecha' and o.d = 'desc' then e.created_at end desc,
          -- Precio: las que no tienen, al final.
          case when o.s = 'precio' and o.sees_price and o.d = 'asc' then e.price end asc nulls last,
          case when o.s = 'precio' and o.sees_price and o.d = 'desc' then e.price end desc nulls last,
          -- Días en taller: primero las que siguen en el taller.
          case when o.s = 'dias_taller' then e.workshop_ongoing end desc,
          case when o.s = 'dias_taller' and o.d = 'asc' then e.workshop_days end asc,
          case when o.s = 'dias_taller' and o.d = 'desc' then e.workshop_days end desc,
          e.created_at, e.code) as ord
  from enriched e
  cross join lateral (
    select
      case when p_sort in ('guia', 'fecha', 'precio', 'dias_taller') then p_sort else 'guia' end as s,
      case when p_dir = 'asc' then 'asc' else 'desc' end as d,
      private.has_role('{admin,ventas,logistica}') as sees_price
  ) o
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
    ) x
    -- Las entregadas hoy, al final: ya no requieren trabajo. Luego, el orden elegido.
    order by x.ord
  limit least(greatest(p_limit, 1), 5000)
  offset greatest(p_offset, 0)
  )
  select e.id, e.code, e.restoration_id, e.restoration_code, e.client_name, e.description,
    e.service_name, e.material_name, e.measure, e.weight_grams,
    e.status, e.location, e.urgent, e.ready_for_delivery, e.workshop_id, e.workshop_name,
    e.arrived_at, (e.w ->> 'days')::integer, (e.w ->> 'ongoing')::boolean,
    (select h.note from public.piece_status_history h
     where h.piece_id = e.id and h.event = 'estado' and h.to_status = 'observada'
     order by h.occurred_at desc, h.id desc limit 1),
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
    e.estimated_delivery_date,
    e.workshop_delivery_date,
    e.created_at,
    e.finished_at,
    e.total_count
  from (
    select e.*,
      case when e.wd is null then
        (select to_jsonb(w) from public.workshop_days(private.piece_history_json(e.id), now()) w limit 1)
      else e.wd end as w
    from page e
  ) e
  order by e.ord;
$$;

revoke execute on function public.list_pieces_board(text, public.piece_location[], public.piece_status[], uuid[], integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text, text[], boolean, date, date, text, boolean) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location[], public.piece_status[], uuid[], integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text, text[], boolean, date, date, text, boolean) to authenticated;
