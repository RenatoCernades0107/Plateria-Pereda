-- Filtros de selección múltiple en el listado de restauraciones: estado, pago, tipo,
-- origen y taller aceptan varios valores ("cualquiera de"); vacío o null = sin filtro.
drop function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer, public.restoration_origin);

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
  p_origin public.restoration_origin[] default null
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
  filtered as (
    select r.*, c.display_name as client_name, c.document_number, k.display_name as contact_name,
      (select count(*)::integer from public.pieces p where p.restoration_id = r.id) as pieces_count
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
    cross join role
    where role.r is not null
      and (role.r in ('admin', 'ventas') or not private.is_past_restoration(r.id, r.status))
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

revoke execute on function public.list_restorations(text, public.restoration_status[], public.payment_status[],
  public.payment_type[], uuid, uuid[], date, date, text, text, integer, integer, public.restoration_origin[]) from public, anon;
grant execute on function public.list_restorations(text, public.restoration_status[], public.payment_status[],
  public.payment_type[], uuid, uuid[], date, date, text, text, integer, integer, public.restoration_origin[]) to authenticated;
