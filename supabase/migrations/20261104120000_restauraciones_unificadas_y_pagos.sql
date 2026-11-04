-- Restauraciones en una sola vista y vista de pagos (pedido del 2026-11-03):
--   * list_restorations: las terminadas (anuladas, rechazadas y completadas desde antes de
--     hoy, lo que antes era el "historial") van al final del listado, sea cual sea el
--     orden elegido; `is_archived` las marca. Así la vista principal muestra todas y el
--     CSV puede traerlas todas.
--   * Más columnas para el CSV (tipo de guía, teléfonos, email, notas, pedido de
--     Shopify, adelanto, reembolsos, último pago, quién registró, talleres, fecha de
--     cierre). Los montos y los datos de contacto, solo para admin y ventas.
--   * list_payments: pagos y reembolsos de todas las restauraciones, con filtros y
--     totales (solo admin y ventas, como la tabla `payments`).
--   * payment_method_names: los métodos usados en algún pago (también las pasarelas de
--     Shopify), para el filtro.
-- Cambian las columnas de list_restorations: se recrea (los parámetros, iguales).
drop function public.list_restorations(text, public.restoration_status[], public.payment_status[],
  public.payment_type[], uuid, uuid[], date, date, text, text, integer, integer, public.restoration_origin[], text, boolean);

create function public.list_restorations(
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
  is_archived boolean,
  finished_at timestamptz,
  kind public.restoration_kind,
  document_type public.document_type,
  client_phone text,
  client_email text,
  contact_phone text,
  notes text,
  shopify_order_name text,
  expected_deposit numeric,
  deposit_amount numeric,
  deposit_percent numeric,
  refunded numeric,
  last_paid_on date,
  created_by_name text,
  workshop_names text,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with role as (
    select private.current_app_role() as r, private.lima_today() as today
  ),
  -- Las piezas de todas las guías en una sola pasada.
  piece_stats as (
    select p.restoration_id,
      count(*)::integer as pieces_count,
      -- Piezas que esperan la respuesta del cliente (Espera respuesta cliente).
      (count(*) filter (where p.status = 'en_espera'))::integer as waiting_count,
      max(greatest(p.delivered_at, p.returned_at, p.cancelled_at)) as finished_at,
      -- Lo mismo que private.is_past_restoration: una pieza rechazada o sin arreglo que
      -- sigue en la tienda (por devolver) mantiene la guía vigente.
      bool_or(p.status in ('rechazada', 'sin_arreglo')
        and p.location in ('sin_enviar', 'en_tienda')) as to_return,
      string_agg(distinct w.name, ', ' order by w.name) as workshop_names
    from public.pieces p
    left join public.workshops w on w.id = p.workshop_id
    group by p.restoration_id
  ),
  -- Reembolsos y último pago de cada guía (para el CSV), en una sola pasada.
  payment_stats as (
    select y.restoration_id,
      coalesce(sum(y.amount) filter (where y.kind = 'reembolso'), 0) as refunded,
      max(y.paid_on) filter (where y.kind = 'pago') as last_paid_on
    from public.payments y
    group by y.restoration_id
  ),
  -- materialized: con los filtros (parámetros) dentro, el plan genérico de la función
  -- estimaba una sola guía y unía con los clientes en un bucle anidado (~1 s con 5 000).
  base as materialized (
    select r.*, c.display_name as client_name, c.document_number,
      c.document_type,
      coalesce(c.phone, c.contact_phone) as client_phone,
      c.email as client_email,
      k.display_name as contact_name, k.phone as contact_phone,
      u.full_name as created_by_name,
      coalesce(s.pieces_count, 0) as pieces_count,
      coalesce(s.waiting_count, 0) as waiting_count,
      s.workshop_names,
      coalesce(y.refunded, 0) as refunded,
      y.last_paid_on,
      -- Cuándo terminó: última entrega, devolución o anulación de sus piezas.
      coalesce(s.finished_at, r.updated_at) as finished_at,
      r.status in ('completada', 'anulada', 'rechazada') and not coalesce(s.to_return, false) as is_past
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
    left join public.profiles u on u.id = r.created_by
    left join piece_stats s on s.restoration_id = r.id
    left join payment_stats y on y.restoration_id = r.id
  ),
  filtered as (
    select r.*,
      -- Terminada (lo que antes era el historial): anulada, rechazada o completada sin
      -- piezas por devolver; las completadas, desde antes de hoy (hora de Lima), así
      -- las de hoy siguen arriba con las vigentes.
      (r.is_past
        and (r.status <> 'completada'
          or (r.finished_at at time zone 'America/Lima')::date < role.today)) as is_archived
    from base r
    cross join role
    where role.r is not null
      and (role.r in ('admin', 'ventas') or not r.is_past)
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
  ),
  scoped as (
    select f.*
    from filtered f
    -- 'activas': sin las terminadas; 'historial': solo ellas; 'todas': todas.
    where coalesce(p_scope, 'todas') = 'todas'
      or f.is_archived = (p_scope = 'historial')
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
    f.is_archived,
    case when f.is_past then f.finished_at end,
    f.kind,
    f.document_type,
    case when role.r in ('admin', 'ventas') then f.client_phone end,
    case when role.r in ('admin', 'ventas') then f.client_email end,
    case when role.r in ('admin', 'ventas') then f.contact_phone end,
    f.notes,
    f.shopify_order_name,
    case when role.r in ('admin', 'ventas') then f.expected_deposit end,
    case when role.r in ('admin', 'ventas') then f.deposit_amount end,
    case when role.r in ('admin', 'ventas') then f.deposit_percent end,
    case when role.r in ('admin', 'ventas') then f.refunded end,
    case when role.r in ('admin', 'ventas') then f.last_paid_on end,
    f.created_by_name,
    f.workshop_names,
    count(*) over ()
  from scoped f
  cross join role
  order by
    -- Las terminadas, siempre al final (con el orden elegido dentro de cada grupo).
    f.is_archived,
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

revoke execute on function public.list_restorations(text, public.restoration_status[], public.payment_status[],
  public.payment_type[], uuid, uuid[], date, date, text, text, integer, integer, public.restoration_origin[], text, boolean) from public, anon;
grant execute on function public.list_restorations(text, public.restoration_status[], public.payment_status[],
  public.payment_type[], uuid, uuid[], date, date, text, text, integer, integer, public.restoration_origin[], text, boolean) to authenticated;

-- Pagos y reembolsos de todas las restauraciones (vista "Pagos"), del más reciente al
-- más antiguo, con los totales de lo filtrado. Solo admin y ventas (P42).
create function public.list_payments(
  p_query text default null,
  p_kind public.payment_kind[] default null,
  p_methods text[] default null,
  p_branch_ids uuid[] default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  restoration_id uuid,
  restoration_code text,
  client_id uuid,
  client_name text,
  document_number text,
  kind public.payment_kind,
  amount numeric,
  method_name text,
  branch_name text,
  paid_on date,
  reason text,
  source public.payment_source,
  shopify_synced_at timestamptz,
  skip_shopify boolean,
  shopify_order_title text,
  shopify_order_name text,
  shopify_order_id text,
  refunded_payment_id uuid,
  created_by_name text,
  created_at timestamptz,
  total_count bigint,
  total_paid numeric,
  total_refunded numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as materialized (
    select y.*, r.code as restoration_code, r.client_id,
      c.display_name as client_name, c.document_number,
      -- Queda solo en el sistema: así se registró o, en una guía antigua con su orden de
      -- piezas, un pago así congeló la orden y los pendientes ya no se envían (como en
      -- el detalle de la guía).
      (y.skip_shopify or (
        y.source = 'sistema' and y.shopify_synced_at is null
        and r.shopify_order_id is not null
        and exists (select 1 from public.payments z
          where z.restoration_id = y.restoration_id and z.skip_shopify)
      )) as only_in_system
    from public.payments y
    join public.restorations r on r.id = y.restoration_id
    join public.clients c on c.id = r.client_id
    where private.current_app_role() in ('admin', 'ventas')
      and (coalesce(cardinality(p_kind), 0) = 0 or y.kind = any (p_kind))
      and (coalesce(cardinality(p_methods), 0) = 0 or y.method_name = any (p_methods))
      and (coalesce(cardinality(p_branch_ids), 0) = 0 or y.branch_id = any (p_branch_ids))
      and (p_from is null or y.paid_on >= p_from)
      and (p_to is null or y.paid_on <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or r.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or y.shopify_order_name ilike '%' || trim(p_query) || '%'
      )
  )
  select f.id, f.restoration_id, f.restoration_code, f.client_id, f.client_name,
    f.document_number, f.kind, f.amount, f.method_name, f.branch_name, f.paid_on,
    f.reason, f.source, f.shopify_synced_at, f.only_in_system, f.shopify_order_title,
    f.shopify_order_name, f.shopify_order_id, f.refunded_payment_id, f.created_by_name,
    f.created_at,
    count(*) over (),
    coalesce(sum(f.amount) filter (where f.kind = 'pago') over (), 0),
    coalesce(sum(f.amount) filter (where f.kind = 'reembolso') over (), 0)
  from filtered f
  order by f.paid_on desc, f.created_at desc, f.id
  limit least(greatest(p_limit, 1), 10000)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_payments(text, public.payment_kind[], text[], uuid[], date, date,
  integer, integer) from public, anon;
grant execute on function public.list_payments(text, public.payment_kind[], text[], uuid[], date, date,
  integer, integer) to authenticated;

-- Métodos usados en algún pago (los del catálogo y las pasarelas de Shopify), para el
-- filtro de la vista de pagos. Solo admin y ventas.
create function public.payment_method_names()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct y.method_name
  from public.payments y
  where private.current_app_role() in ('admin', 'ventas')
  order by 1;
$$;

revoke execute on function public.payment_method_names() from public, anon;
grant execute on function public.payment_method_names() to authenticated;
