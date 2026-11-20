-- Filtros de listados con selección múltiple (varios valores por filtro, combinables entre sí).
-- Los parámetros de un solo valor pasan a arreglos (vacío o null = sin filtro); lo demás no cambia.

drop function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid, integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text);

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

revoke execute on function public.list_pieces_board(text, public.piece_location[], public.piece_status[], uuid[], integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location[], public.piece_status[], uuid[], integer, integer, integer, boolean, boolean, boolean, text, boolean, text, text) to authenticated;

drop function public.list_pieces_history(text, text, public.piece_status, uuid, date, date, integer, integer);

create function public.list_pieces_history(
  p_query text default null,
  p_restoration_code text default null,
  p_status public.piece_status[] default null,
  p_workshop_ids uuid[] default null,
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
      and (coalesce(cardinality(p_status), 0) = 0 or p.status = any (p_status))
      and (coalesce(cardinality(p_workshop_ids), 0) = 0 or p.workshop_id = any (p_workshop_ids))
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

revoke execute on function public.list_pieces_history(text, text, public.piece_status[], uuid[], date, date, integer, integer) from public, anon;
grant execute on function public.list_pieces_history(text, text, public.piece_status[], uuid[], date, date, integer, integer) to authenticated;

drop function public.list_clients(text, public.client_kind, text, boolean, integer, integer);

create function public.list_clients(
  p_query text default null,
  p_kind public.client_kind[] default null,
  p_sync text[] default null,
  p_active boolean default true,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.client_kind,
  display_name text,
  document_type public.document_type,
  document_number text,
  phone text,
  email text,
  active boolean,
  job_id bigint,
  sync_status text,
  last_error text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select c.id, c.kind, c.display_name, c.document_type, c.document_number,
      coalesce(c.phone, c.contact_phone) as phone,
      c.email, c.active, c.created_at, j.id as job_id, j.last_error,
      case
        when j.status is not null then j.status
        when coalesce(c.shopify_customer_id, c.shopify_company_id) is not null then 'ok'
      end as sync_status
    from public.clients c
    left join lateral (
      select sj.id, sj.status, sj.last_error
      from public.shopify_sync_jobs sj
      where sj.entity_table = 'clients' and sj.entity_id = c.id::text
      order by sj.created_at desc, sj.id desc
      limit 1
    ) j on true
    where (select private.current_app_role()) is not null
      and (coalesce(cardinality(p_kind), 0) = 0 or c.kind = any (p_kind))
      and (p_active is null or c.active = p_active)
      and (
        nullif(trim(p_query), '') is null
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or c.email ilike '%' || trim(p_query) || '%'
        or (
          length(regexp_replace(p_query, '\D', '', 'g')) >= 3
          and (
            c.phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
            or c.contact_phone like '%' || regexp_replace(p_query, '\D', '', 'g') || '%'
          )
        )
      )
  )
  select f.id, f.kind, f.display_name, f.document_type, f.document_number, f.phone,
    f.email, f.active, f.job_id, f.sync_status, f.last_error, count(*) over ()
  from filtered f
  where coalesce(cardinality(p_sync), 0) = 0
    or ('ok' = any (p_sync) and f.sync_status = 'ok')
    or ('pending' = any (p_sync) and f.sync_status in ('pending', 'processing'))
    or ('error' = any (p_sync) and f.sync_status = 'error')
  order by f.created_at desc, f.id
  limit least(greatest(p_limit, 1), 100)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_clients(text, public.client_kind[], text[], boolean, integer, integer) from public, anon;
grant execute on function public.list_clients(text, public.client_kind[], text[], boolean, integer, integer) to authenticated;

drop function public.list_logistics_quotes(text, public.quote_status, uuid, public.quote_work_location, boolean, integer, integer);

create function public.list_logistics_quotes(
  p_query text default null,
  p_status public.quote_status[] default null,
  p_workshop_ids uuid[] default null,
  p_location public.quote_work_location[] default null,
  p_without_workshop boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  status public.quote_status,
  client_name text,
  delivery_date date,
  supplier_delivery_date date,
  work_location public.quote_work_location,
  workshop_id uuid,
  workshop_name text,
  items_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.code, q.status, q.client_name, q.delivery_date, q.supplier_delivery_date,
    q.work_location, q.workshop_id, w.name,
    (select count(*)::integer from public.quote_items i where i.quote_id = q.id),
    count(*) over ()
  from public.quotes q
  left join public.workshops w on w.id = q.workshop_id
  where (select private.has_role('{admin,ventas,logistica}'))
    and q.status in ('aceptada', 'facturada')
    and (coalesce(cardinality(p_status), 0) = 0 or q.status = any (p_status))
    -- Talleres elegidos y/o "sin taller": basta con cumplir uno.
    and (
      coalesce(cardinality(p_workshop_ids), 0) = 0 and not coalesce(p_without_workshop, false)
      or q.workshop_id = any (p_workshop_ids)
      or (coalesce(p_without_workshop, false) and q.workshop_id is null)
    )
    and (coalesce(cardinality(p_location), 0) = 0 or q.work_location = any (p_location))
    and (
      nullif(trim(p_query), '') is null
      or q.code ilike '%' || trim(p_query) || '%'
      or q.client_name ilike '%' || trim(p_query) || '%'
    )
  order by q.delivery_date nulls last, q.number desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_logistics_quotes(text, public.quote_status[], uuid[], public.quote_work_location[], boolean, integer, integer) from public, anon;
grant execute on function public.list_logistics_quotes(text, public.quote_status[], uuid[], public.quote_work_location[], boolean, integer, integer) to authenticated;

drop function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer, text, text);

create function public.list_whatsapp_quotes(
  p_query text default null,
  p_status public.whatsapp_quote_status[] default null,
  p_client_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_sort text default 'created_at',
  p_dir text default 'desc'
)
returns table (
  id uuid,
  code text,
  client_id uuid,
  client_name text,
  contact_name text,
  customer_name text,
  customer_phone text,
  status public.whatsapp_quote_status,
  items_count integer,
  pending_count integer,
  total numeric,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select q.*, c.display_name as client_name, k.display_name as contact_name,
      (select count(*)::integer from public.whatsapp_quote_items i where i.quote_id = q.id) as items_count,
      private.whatsapp_quote_ordered_count(q.id) as ordered_count
    from public.whatsapp_quotes q
    left join public.clients c on c.id = q.client_id
    left join public.contacts k on k.id = q.contact_id
    where (select private.has_role('{admin,ventas}'))
      and (coalesce(cardinality(p_status), 0) = 0 or q.status = any (p_status))
      and (p_client_id is null or q.client_id = p_client_id)
      and (p_from is null or (q.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (q.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or q.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or k.display_name ilike '%' || trim(p_query) || '%'
        or q.customer_name ilike '%' || trim(p_query) || '%'
        or q.customer_phone ilike '%' || trim(p_query) || '%'
        or exists (
          select 1 from public.whatsapp_quote_items i
          where i.quote_id = q.id and i.description ilike '%' || trim(p_query) || '%'
        )
      )
  )
  select f.id, f.code, f.client_id, f.client_name, f.contact_name, f.customer_name, f.customer_phone,
    f.status, f.items_count, f.items_count - f.ordered_count, f.total, f.created_at, count(*) over ()
  from filtered f
  order by
    case when p_sort = 'code' and p_dir = 'asc' then f.code end asc,
    case when p_sort = 'code' and p_dir <> 'asc' then f.code end desc,
    case when p_sort = 'client' and p_dir = 'asc'
      then lower(coalesce(nullif(f.client_name, ''), f.customer_name)) end asc nulls last,
    case when p_sort = 'client' and p_dir <> 'asc'
      then lower(coalesce(nullif(f.client_name, ''), f.customer_name)) end desc nulls last,
    case when p_sort = 'total' and p_dir = 'asc' then f.total end asc,
    case when p_sort = 'total' and p_dir <> 'asc' then f.total end desc,
    case when p_dir = 'asc' then f.created_at end asc,
    f.created_at desc,
    f.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status[], uuid, date, date, integer, integer, text, text) from public, anon;
grant execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status[], uuid, date, date, integer, integer, text, text) to authenticated;

