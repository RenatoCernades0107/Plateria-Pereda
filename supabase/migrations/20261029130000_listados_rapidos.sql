-- Paso 15.3: listados rápidos con volumen (medido con supabase/seed-rendimiento.sql:
-- ~5 000 guías y ~9 600 piezas). Mismas columnas, filas y orden que antes; los tests de
-- listados (16_listados, 33_vista_piezas_tabla, 45_guias_esperando_cliente…) lo cubren.
--
-- list_restorations: de ~550 ms a ~25 ms. El plan genérico de la función (con los filtros
-- como parámetros) estimaba una sola guía y unía con los clientes en un bucle anidado; la
-- base se materializa antes de filtrar y las piezas se agregan en una sola pasada.
--
-- list_pieces_board: de ~350 ms a ~105 ms. Los días en taller (que recorren el historial
-- de cada pieza) se calculan solo para la página mostrada, salvo que se filtre u ordene
-- por ellos; la función de "guía pasada" solo se llama para guías cerradas, y "hoy" en
-- Lima se calcula una vez.

create or replace function public.list_restorations(
  p_query text default null,
  p_status public.restoration_status[] default null,
  p_payment_status public.payment_status[] default null,
  p_payment_type public.payment_type[] default null,
  p_client_id uuid default null,
  p_workshop_ids uuid[] default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'created_at',
  p_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0,
  p_origin public.restoration_origin[] default null,
  p_scope text default 'todas',
  p_waiting_client boolean default false
)
returns table (
  id uuid,
  code text,
  client_id uuid,
  client_name text,
  document_number text,
  contact_name text,
  status public.restoration_status,
  payment_status public.payment_status,
  payment_type public.payment_type,
  pieces_count integer,
  total numeric,
  paid numeric,
  balance numeric,
  created_at timestamptz,
  origin public.restoration_origin,
  waiting_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with role as (
    select private.current_app_role() as r
  ),
  -- Las piezas de todas las guías en una sola pasada (antes, cuatro subconsultas por
  -- guía: con miles de guías el listado pasaba del medio segundo).
  piece_stats as (
    select p.restoration_id,
      count(*)::integer as pieces_count,
      -- Piezas que esperan la respuesta del cliente (Espera respuesta cliente).
      (count(*) filter (where p.status = 'en_espera'))::integer as waiting_count,
      max(greatest(p.delivered_at, p.returned_at, p.cancelled_at)) as finished_at,
      -- Lo mismo que private.is_past_restoration: una pieza rechazada o sin arreglo que
      -- sigue en la tienda (por devolver) mantiene la guía vigente.
      bool_or(p.status in ('rechazada', 'sin_arreglo')
        and p.location in ('sin_enviar', 'en_tienda')) as to_return
    from public.pieces p
    group by p.restoration_id
  ),
  -- materialized: con los filtros (parámetros) dentro, el plan genérico de la función
  -- estimaba una sola guía y unía con los clientes en un bucle anidado (~1 s con 5 000).
  base as materialized (
    select r.*, c.display_name as client_name, c.document_number, k.display_name as contact_name,
      coalesce(s.pieces_count, 0) as pieces_count,
      coalesce(s.waiting_count, 0) as waiting_count,
      -- Cuándo terminó: última entrega, devolución o anulación de sus piezas.
      coalesce(s.finished_at, r.updated_at) as finished_at,
      r.status in ('completada', 'anulada', 'rechazada') and not coalesce(s.to_return, false) as is_past
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
    left join piece_stats s on s.restoration_id = r.id
  ),
  filtered as (
    select r.*
    from base r
    cross join role
    where role.r is not null
      and (role.r in ('admin', 'ventas') or not r.is_past)
      -- Historial: anuladas, rechazadas y completadas sin piezas por devolver; las
      -- completadas, desde antes de hoy (hora de Lima).
      and (
        coalesce(p_scope, 'todas') = 'todas'
        or (
          r.is_past
          and (r.status <> 'completada'
            or (r.finished_at at time zone 'America/Lima')::date < private.lima_today())
        ) = (p_scope = 'historial')
      )
      and (coalesce(cardinality(p_status), 0) = 0 or r.status = any (p_status))
      -- Logística no filtra por dinero (no lo ve).
      and (coalesce(cardinality(p_payment_status), 0) = 0
        or (role.r in ('admin', 'ventas') and r.payment_status = any (p_payment_status)))
      and (coalesce(cardinality(p_payment_type), 0) = 0 or r.payment_type = any (p_payment_type))
      and (p_client_id is null or r.client_id = p_client_id)
      and (not coalesce(p_waiting_client, false) or r.waiting_count > 0)
      and (coalesce(cardinality(p_origin), 0) = 0 or r.origin = any (p_origin))
      and (coalesce(cardinality(p_workshop_ids), 0) = 0 or exists (
        select 1 from public.pieces p where p.restoration_id = r.id and p.workshop_id = any (p_workshop_ids)
      ))
      and (p_from is null or (r.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (r.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or r.code ilike '%' || trim(p_query) || '%'
        or r.client_name ilike '%' || trim(p_query) || '%'
        or r.document_number ilike '%' || trim(p_query) || '%'
        or r.contact_name ilike '%' || trim(p_query) || '%'
      )
  )
  select f.id, f.code, f.client_id, f.client_name, f.document_number, f.contact_name,
    f.status,
    case when role.r in ('admin', 'ventas') then f.payment_status end,
    f.payment_type, f.pieces_count,
    case when role.r in ('admin', 'ventas') then f.total end,
    case when role.r in ('admin', 'ventas') then f.paid end,
    case when role.r in ('admin', 'ventas') then f.balance end,
    f.created_at,
    f.origin,
    f.waiting_count,
    count(*) over ()
  from filtered f
  cross join role
  order by
    case when p_dir = 'asc' and p_sort = 'code' then f.code end asc,
    case when p_dir = 'desc' and p_sort = 'code' then f.code end desc,
    case when p_dir = 'asc' and p_sort = 'client' then f.client_name end asc,
    case when p_dir = 'desc' and p_sort = 'client' then f.client_name end desc,
    case when p_dir = 'asc' and p_sort = 'total' and role.r in ('admin', 'ventas') then f.total end asc,
    case when p_dir = 'desc' and p_sort = 'total' and role.r in ('admin', 'ventas') then f.total end desc,
    case when p_dir = 'asc' and p_sort = 'created_at' then f.created_at end asc,
    f.created_at desc,
    f.id
  limit least(greatest(p_limit, 1), 5000)
  offset greatest(p_offset, 0);
$$;

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
  p_no_workshop boolean default false,
  p_sort text default 'guia',
  p_dir text default 'desc'
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
      (p.status in ('rechazada', 'sin_arreglo') and p.location in ('sin_enviar', 'en_tienda')) as to_return
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
      and p.status <> 'anulada'
      and (p.status <> 'entregada' or p.finished_today)
      and (
        not (p.status in ('rechazada', 'sin_arreglo') and p.location not in ('sin_enviar', 'en_tienda'))
        or p.finished_today
      )
      -- Solo una guía cerrada puede ser "pasada": el CASE evita llamar a la función (con
      -- su consulta) por cada pieza de las guías en curso.
      and (
        not case when r.status in ('completada', 'anulada', 'rechazada')
          then private.is_past_restoration(r.id, r.status) else false end
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
      row_number() over (order by e.finished_today,
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
  limit least(greatest(p_limit, 1), 200)
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
