-- Listados operativos (Fase 12): restauraciones con filtros, orden y paginación en
-- el servidor, y la vista de piezas de logística. Corren con permisos de definidor y
-- aplican el rol en el WHERE: logística no recibe montos ni ve lo pasado (P42, D24).

create index if not exists restorations_payment_status_idx
  on public.restorations (payment_status, created_at desc);
create index if not exists restorations_payment_type_idx
  on public.restorations (payment_type, created_at desc);

-- p_sort: created_at | code | client | total; p_dir: asc | desc. Las fechas son días
-- calendario de Lima (inclusive).
create or replace function public.list_restorations(
  p_query text default null,
  p_status public.restoration_status default null,
  p_payment_status public.payment_status default null,
  p_payment_type public.payment_type default null,
  p_client_id uuid default null,
  p_workshop_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'created_at',
  p_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0
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
  filtered as (
    select r.*, c.display_name as client_name, c.document_number, k.display_name as contact_name,
      (select count(*)::integer from public.pieces p where p.restoration_id = r.id) as pieces_count
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
    cross join role
    where role.r is not null
      and (role.r in ('admin', 'ventas') or r.status not in ('completada', 'anulada'))
      and (p_status is null or r.status = p_status)
      -- Logística no filtra por dinero (no lo ve).
      and (p_payment_status is null or (role.r in ('admin', 'ventas') and r.payment_status = p_payment_status))
      and (p_payment_type is null or r.payment_type = p_payment_type)
      and (p_client_id is null or r.client_id = p_client_id)
      and (p_workshop_id is null or exists (
        select 1 from public.pieces p where p.restoration_id = r.id and p.workshop_id = p_workshop_id
      ))
      and (p_from is null or (r.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (r.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or r.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or k.display_name ilike '%' || trim(p_query) || '%'
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

revoke execute on function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer) from public, anon;
grant execute on function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer) to authenticated;

-- Vista operativa de piezas (inicio de logística): solo piezas en curso (no
-- entregadas ni anuladas) de restauraciones no pasadas, sin precios, con los días en
-- taller y la nota de la última observación.
create or replace function public.list_pieces_board(
  p_query text default null,
  p_location public.piece_location default null,
  p_status public.piece_status default null,
  p_workshop_id uuid default null,
  p_min_workshop_days integer default null,
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
  status public.piece_status,
  location public.piece_location,
  workshop_id uuid,
  workshop_name text,
  arrived_at timestamptz,
  workshop_days integer,
  workshop_ongoing boolean,
  last_observation text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      and p.status not in ('entregada', 'anulada')
      and r.status not in ('completada', 'anulada')
      and (p_location is null or p.location = p_location)
      and (p_status is null or p.status = p_status)
      and (p_workshop_id is null or p.workshop_id = p_workshop_id)
      and (
        nullif(trim(p_query), '') is null
        or p.code ilike '%' || trim(p_query) || '%'
        or p.description ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
      )
  ),
  enriched as (
    select b.*, w.days as workshop_days, w.ongoing as workshop_ongoing,
      (select h.note from public.piece_status_history h
       where h.piece_id = b.id and h.to_status = 'observada'
       order by h.occurred_at desc, h.id desc limit 1) as last_observation
    from base b
    cross join lateral public.workshop_days((
      select coalesce(jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'at', h.occurred_at)
        order by h.occurred_at, h.id), '[]')
      from public.piece_status_history h where h.piece_id = b.id
    ), now()) w
  )
  select e.id, e.code, e.restoration_id, e.restoration_code, e.client_name, e.description,
    e.status, e.location, e.workshop_id, e.workshop_name, e.arrived_at,
    e.workshop_days, e.workshop_ongoing, e.last_observation, count(*) over ()
  from enriched e
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
  order by e.workshop_ongoing desc, e.workshop_days desc, e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid, integer, integer, integer)
  from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid, integer, integer, integer)
  to authenticated;
