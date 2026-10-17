-- Vista de piezas y listados (pedido del 2026-10-17):
--   * "Días en la ubicación": desde cuándo está la pieza donde está (location_since).
--   * Cantidad de cada pieza en las vistas de piezas.
--   * Filtro "Sin taller" (sin taller asignado).
--   * "Listas" incluye las piezas por devolver al cliente (rechazadas o sin arreglo en la
--     tienda): en ambos casos la pieza está lista para salir de la tienda.
--   * Historial de guías (punto 7): una guía anulada, rechazada o completada pasa al
--     historial solo cuando no le quedan piezas por devolver; mientras tanto sigue en la
--     lista de activas (y logística la sigue viendo para devolverlas).

-- 1. Desde cuándo está la pieza en su ubicación actual (igual a locationSince()).
--   Por WhatsApp: desde el registro.
--   Sin enviar: la Observada, desde la observación; las demás, desde la llegada a la
--     tienda o la vuelta de la revisión (la más reciente).
--   En taller: desde el envío (por trabajo) o el envío a revisión (el más reciente de
--     los que siguen abiertos).
--   En tienda: desde la última vuelta del taller o de la revisión, o la llegada.
--   Entregada: desde la entrega (o la devolución al cliente). Anulada: desde la anulación.
--   Sin la fecha, desde el registro.
create function public.piece_location_since(
  p_location public.piece_location,
  p_status public.piece_status,
  p_created_at timestamptz,
  p_arrived_at timestamptz default null,
  p_observed_at timestamptz default null,
  p_last_sent_at timestamptz default null,
  p_last_returned_at timestamptz default null,
  p_review_sent_at timestamptz default null,
  p_review_returned_at timestamptz default null,
  p_delivered_at timestamptz default null,
  p_returned_at timestamptz default null,
  p_cancelled_at timestamptz default null
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    case p_location
      when 'por_whatsapp' then p_created_at
      when 'sin_enviar' then
        case when p_status = 'observada' then p_observed_at
          else greatest(p_arrived_at, p_review_returned_at) end
      -- (Sin funciones de private: la clave secreta también la consulta.)
      when 'en_taller' then greatest(
        case when p_status in ('aprobada', 'observada')
            and p_last_sent_at is not null
            and (p_last_returned_at is null or p_last_returned_at < p_last_sent_at)
            and (p_status = 'aprobada' or p_observed_at is null or p_last_sent_at > p_observed_at)
          then p_last_sent_at end,
        case when p_review_sent_at is not null
            and (p_review_returned_at is null or p_review_returned_at < p_review_sent_at)
          then p_review_sent_at end
      )
      when 'en_tienda' then greatest(p_last_returned_at, p_review_returned_at, p_arrived_at)
      when 'entregada' then
        case when p_status = 'entregada' then coalesce(p_delivered_at, p_returned_at)
          else coalesce(p_returned_at, p_delivered_at) end
      when 'anulada' then p_cancelled_at
    end,
    p_created_at
  );
$$;

revoke execute on function public.piece_location_since(public.piece_location, public.piece_status,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz) from public, anon;
grant execute on function public.piece_location_since(public.piece_location, public.piece_status,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz) to authenticated, service_role;

-- 2. Guía pasada: anulada, rechazada o completada y sin piezas por devolver (rechazadas
-- o sin arreglo que siguen en la tienda). Antes una completada o anulada siempre era
-- pasada, y una rechazada esperaba solo a las que habían llegado a la tienda.
create or replace function private.is_past_restoration(p_id uuid, p_status public.restoration_status)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_status in ('completada', 'anulada', 'rechazada')
    and not exists (
      select 1 from public.pieces p
      where p.restoration_id = p_id
        and p.status in ('rechazada', 'sin_arreglo')
        and p.location in ('sin_enviar', 'en_tienda')
    );
$$;

-- 3. Historial de guías: las pasadas; las completadas, además, desde antes de hoy.
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
  p_scope text default 'todas'
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
  base as (
    select r.*, c.display_name as client_name, c.document_number, k.display_name as contact_name,
      (select count(*)::integer from public.pieces p where p.restoration_id = r.id) as pieces_count,
      -- Cuándo terminó: última entrega, devolución o anulación de sus piezas.
      coalesce(
        (select max(greatest(p.delivered_at, p.returned_at, p.cancelled_at))
         from public.pieces p where p.restoration_id = r.id),
        r.updated_at
      ) as finished_at,
      private.is_past_restoration(r.id, r.status) as is_past
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
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

-- 4. Vista de piezas: cantidad, días en la ubicación, filtro "Sin taller" y "Listas"
-- con las por devolver. Cambian los parámetros y las columnas: se recrea.
-- p_to_return se mantiene (solo las por devolver).
drop function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text);
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
    case when private.has_role('{admin,ventas}') then e.price end,
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

-- 5. Historial de piezas: con la cantidad. Cambian las columnas: se recrea igual.
drop function public.list_pieces_history(text, text, public.piece_status, uuid, date, date, integer, integer);
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
    case when private.has_role('{admin,ventas}') then f.price end,
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
