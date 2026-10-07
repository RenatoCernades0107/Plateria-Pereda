-- Ubicaciones de la pieza y restauración "Rechazada" (P48, Paso 8.7):
--   * ubicaciones: por_whatsapp → sin_enviar → en_taller → en_tienda (de vuelta del
--     taller) → entregada; anulada aparte;
--   * las piezas de oficina nacen en la tienda (sin la casilla "ya está en tienda");
--   * todas las piezas cerradas: rechazada si alguna fue rechazada o sin arreglo,
--     anulada si todas se anularon;
--   * logística ve las restauraciones rechazadas mientras tengan piezas por devolver.

-- 1. "Pasada" para logística (D24, P48).
create or replace function private.is_past_restoration(
  p_id uuid,
  p_status public.restoration_status
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_status in ('completada', 'anulada')
    or (p_status = 'rechazada' and not exists (
      select 1 from public.pieces p
      where p.restoration_id = p_id
        and p.status in ('rechazada', 'sin_arreglo')
        and p.returned_at is null
        and p.arrived_at is not null
    ));
$$;

revoke execute on function private.is_past_restoration(uuid, public.restoration_status) from public, anon;
grant execute on function private.is_past_restoration(uuid, public.restoration_status)
  to authenticated, service_role;

-- 2. Las piezas de oficina nacen en la tienda; las de WhatsApp se marcan al llegar.
create or replace function private.set_office_piece_arrival()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.arrived_at is null and exists (
    select 1 from public.restorations r where r.id = new.restoration_id and r.origin = 'oficina'
  ) then
    new.arrived_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function private.set_office_piece_arrival() from public, anon, authenticated;

create trigger pieces_set_office_arrival
  before insert on public.pieces
  for each row execute function private.set_office_piece_arrival();

update public.pieces p set arrived_at = p.created_at
from public.restorations r
where r.id = p.restoration_id and r.origin = 'oficina' and p.arrived_at is null;

-- 3. Ubicación (§7.2): se recrea la columna generada y la vista que la usa.
drop view public.pieces_operational;
alter table public.pieces drop column location;
alter table public.pieces add column location public.piece_location generated always as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when arrived_at is null then 'por_whatsapp'::public.piece_location
    when status = 'enviada_taller' and not (
      last_returned_at is not null and last_sent_at is not null and last_returned_at >= last_sent_at
    ) then 'en_taller'::public.piece_location
    when first_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end
) stored;

drop function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz);
create or replace function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz,
  p_first_sent_at timestamptz default null,
  p_last_sent_at timestamptz default null,
  p_last_returned_at timestamptz default null,
  p_returned_at timestamptz default null
)
returns public.piece_location
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'anulada' then 'anulada'::public.piece_location
    when p_status = 'entregada' then 'entregada'::public.piece_location
    when p_status in ('rechazada', 'sin_arreglo') and p_returned_at is not null
      then 'entregada'::public.piece_location
    when p_arrived_at is null then 'por_whatsapp'::public.piece_location
    when p_status = 'enviada_taller' and not (
      p_last_returned_at is not null and p_last_sent_at is not null and p_last_returned_at >= p_last_sent_at
    ) then 'en_taller'::public.piece_location
    when p_first_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end;
$$;

revoke execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;

create view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

comment on view public.pieces_operational is
  'Piezas sin precio (P42). Logística no ve las de restauraciones pasadas (D24, P48).';

revoke all on public.pieces_operational from anon, authenticated;
grant select on public.pieces_operational to authenticated;

create or replace view public.restorations_operational
with (security_barrier = true)
as
select r.id, r.code, r.client_id, r.contact_id, r.status, r.payment_type, r.notes,
  r.shopify_order_name, r.created_by, r.created_at, r.updated_at, r.origin, r.whatsapp_quote_id
from public.restorations r
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 4. Estado general (§7.3): sin piezas vivas, Rechazada si alguna fue rechazada o sin
-- arreglo; Anulada si todas se anularon.
create or replace function public.derive_restoration_status(p_pieces jsonb)
returns public.restoration_status
language sql
immutable
set search_path = ''
as $$
  with p as (
    select (e ->> 'status')::public.piece_status as status,
      (e ->> 'approvedAt') is not null as approved,
      (e ->> 'firstSentAt') is not null as sent,
      coalesce((e ->> 'readyForDelivery')::boolean, false) as ready
    from jsonb_array_elements(coalesce(p_pieces, '[]')) e
  ),
  a as (select * from p where status not in ('anulada', 'rechazada', 'sin_arreglo'))
  select case
    when not exists (select 1 from a) then
      case
        when not exists (select 1 from p) then 'registrada'
        when exists (select 1 from p where status in ('rechazada', 'sin_arreglo')) then 'rechazada'
        else 'anulada'
      end
    when (select bool_and(status = 'entregada') from a) then 'completada'
    when (select bool_and(ready or status = 'entregada') from a) then 'lista'
    when (select bool_or(ready or status = 'entregada') from a) then 'parcialmente_lista'
    when (select bool_or(sent) from a) then 'en_proceso'
    when (select bool_and(approved) from a) then 'aprobada'
    else 'registrada'
  end::public.restoration_status;
$$;

create or replace function private.guard_piece_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.restorations
    where id = new.restoration_id and status in ('completada', 'anulada', 'rechazada')
  ) then
    raise exception 'No se agregan piezas a una restauración completada, anulada o rechazada'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 5. Logística ve las restauraciones rechazadas con piezas por devolver.
create or replace function public.change_piece_status(
  p_piece_ids uuid[],
  p_to public.piece_status,
  p_note text default null,
  p_workshop_id uuid default null
)
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_piece public.pieces;
  v_rule public.piece_status_transitions;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_workshop uuid;
  v_from public.piece_status;
  v_count integer := 0;
begin
  if v_role is null then
    raise exception 'Inicia sesión para cambiar estados' using errcode = '42501';
  end if;
  if p_piece_ids is null or cardinality(p_piece_ids) = 0 then
    raise exception 'Elige al menos una pieza' using errcode = '22023';
  end if;
  if length(v_note) > 1000 then
    raise exception 'La nota tiene más de 1000 caracteres' using errcode = '22023';
  end if;

  for v_piece in
    select * from public.pieces p where p.id = any (p_piece_ids) order by p.id for update
  loop
    if v_role = 'logistica' and exists (
      select 1 from public.restorations r
      where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
    ) then
      raise exception 'Tu rol no puede hacer este cambio de estado.' using errcode = '42501';
    end if;

    select * into v_rule from public.piece_status_transitions t
    where t.from_status = v_piece.status and t.to_status = p_to;
    if v_rule is null then
      raise exception 'La pieza % no puede pasar a ese estado.', v_piece.code using errcode = '23514';
    end if;
    if not (v_role = any (v_rule.roles)) then
      raise exception 'Tu rol no puede hacer este cambio de estado.' using errcode = '42501';
    end if;
    if v_rule.requires_note and v_note is null then
      raise exception 'Escribe una nota para este cambio de estado.' using errcode = '23514';
    end if;
    -- Al taller solo va lo que está en la tienda (P47).
    if p_to = 'enviada_taller' and v_piece.arrived_at is null then
      raise exception 'La pieza % aún no llegó a la tienda.', v_piece.code using errcode = '23514';
    end if;
    -- Desde Interno solo se entrega u observa lo que ya volvió del taller (P47).
    if v_piece.status = 'enviada_taller' and p_to in ('entregada', 'observada')
       and not v_piece.ready_for_delivery then
      raise exception 'La pieza % sigue en el taller.', v_piece.code using errcode = '23514';
    end if;
    v_workshop := coalesce(p_workshop_id, v_piece.workshop_id);
    if v_rule.requires_workshop and v_workshop is null then
      raise exception 'Elige el taller al que se envía la pieza.' using errcode = '23514';
    end if;
    if v_rule.requires_workshop and p_workshop_id is not null and not exists (
      select 1 from public.workshops w where w.id = p_workshop_id and w.active
    ) then
      raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
    end if;

    v_from := v_piece.status;
    update public.pieces p set
      status = p_to,
      workshop_id = case when v_rule.requires_workshop then v_workshop else p.workshop_id end,
      approved_at = case when p_to = 'aprobada' then now() else p.approved_at end,
      first_sent_at = case when p_to = 'enviada_taller' then coalesce(p.first_sent_at, now()) else p.first_sent_at end,
      last_sent_at = case when p_to = 'enviada_taller' then now() else p.last_sent_at end,
      delivered_at = case when p_to = 'entregada' then now() else p.delivered_at end,
      cancelled_at = case when p_to in ('anulada', 'rechazada', 'sin_arreglo') then now() else p.cancelled_at end
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_from, p_to, v_note);

    v_count := v_count + 1;
    piece_id := v_piece.id;
    status := v_piece.status;
    return next;
  end loop;

  if v_count = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.mark_pieces_arrived(p_piece_ids uuid[])
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_piece public.pieces;
  v_count integer := 0;
begin
  if v_role is null then
    raise exception 'Inicia sesión para marcar llegadas' using errcode = '42501';
  end if;
  for v_piece in
    select * from public.pieces p where p.id = any (p_piece_ids) order by p.id for update
  loop
    if v_role = 'logistica' and exists (
      select 1 from public.restorations r
      where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
    ) then
      raise exception 'Tu rol no puede marcar esta llegada.' using errcode = '42501';
    end if;
    if v_piece.arrived_at is not null
       or v_piece.status not in ('registrada', 'en_consulta', 'en_espera', 'aprobada') then
      raise exception 'La pieza % ya está en tienda o no espera llegar.', v_piece.code
        using errcode = '23514';
    end if;
    update public.pieces p set arrived_at = now()
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'llegada');
    v_count := v_count + 1;
    piece_id := v_piece.id;
    status := v_piece.status;
    return next;
  end loop;
  if v_count = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.receive_from_workshop(p_piece_ids uuid[])
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_piece public.pieces;
  v_count integer := 0;
begin
  if v_role is null or v_role not in ('admin', 'logistica') then
    raise exception 'Tu rol no puede recibir piezas del taller.' using errcode = '42501';
  end if;
  for v_piece in
    select * from public.pieces p where p.id = any (p_piece_ids) order by p.id for update
  loop
    if v_role = 'logistica' and exists (
      select 1 from public.restorations r
      where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
    ) then
      raise exception 'Tu rol no puede recibir piezas del taller.' using errcode = '42501';
    end if;
    if v_piece.status <> 'enviada_taller' or v_piece.ready_for_delivery then
      raise exception 'La pieza % no está en el taller.', v_piece.code using errcode = '23514';
    end if;
    update public.pieces p set last_returned_at = now()
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'vuelta_taller');
    v_count := v_count + 1;
    piece_id := v_piece.id;
    status := v_piece.status;
    return next;
  end loop;
  if v_count = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.return_pieces_to_client(p_piece_ids uuid[])
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_piece public.pieces;
  v_count integer := 0;
begin
  if v_role is null then
    raise exception 'Inicia sesión para devolver piezas' using errcode = '42501';
  end if;
  for v_piece in
    select * from public.pieces p where p.id = any (p_piece_ids) order by p.id for update
  loop
    if v_role = 'logistica' and exists (
      select 1 from public.restorations r
      where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
    ) then
      raise exception 'Tu rol no puede devolver esta pieza.' using errcode = '42501';
    end if;
    -- Por devolver: rechazada o sin arreglo, en la tienda (Sin enviar o En tienda).
    if v_piece.status not in ('rechazada', 'sin_arreglo') or v_piece.returned_at is not null
       or v_piece.location not in ('sin_enviar', 'en_tienda') then
      raise exception 'La pieza % no está por devolver.', v_piece.code using errcode = '23514';
    end if;
    update public.pieces p set returned_at = now(), returned_by = auth.uid()
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'devolucion_cliente');
    v_count := v_count + 1;
    piece_id := v_piece.id;
    status := v_piece.status;
    return next;
  end loop;
  if v_count = 0 then
    raise exception 'Las piezas no existen' using errcode = '23503';
  end if;
end;
$$;

create or replace function public.assign_piece_workshop(p_piece_ids uuid[], p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select private.has_role('{admin,ventas,logistica}')) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;
  if p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.pieces p
    where p.id = any (p_piece_ids)
      and p.status in ('enviada_taller', 'entregada', 'anulada', 'rechazada', 'sin_arreglo')
  ) then
    raise exception 'No se cambia el taller de una pieza que está en el taller, entregada o cerrada.'
      using errcode = '23514';
  end if;
  if (select private.has_role('{logistica}')) and exists (
    select 1 from public.pieces p join public.restorations r on r.id = p.restoration_id
    where p.id = any (p_piece_ids) and private.is_past_restoration(r.id, r.status)
  ) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;

  update public.pieces p set workshop_id = p_workshop_id
  where p.id = any (p_piece_ids) and p.workshop_id is distinct from p_workshop_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.piece_logistics_info(p_restoration_id uuid)
returns table (piece_id uuid, workshop_days integer, workshop_ongoing boolean, last_observation text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, w.days, w.ongoing,
    (select h.note from public.piece_status_history h
     where h.piece_id = p.id and h.event = 'estado' and h.to_status = 'observada'
     order by h.occurred_at desc, h.id desc limit 1)
  from public.pieces_operational p
  cross join lateral public.workshop_days(private.piece_history_json(p.id), now()) w
  where p.restoration_id = p_restoration_id;
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
  p_to_return boolean default false
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
  urgent boolean,
  ready_for_delivery boolean,
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
    select p.*, r.code as restoration_code, c.display_name as client_name, w.name as workshop_name,
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
    e.status, e.location, e.urgent, e.ready_for_delivery, e.workshop_id, e.workshop_name,
    e.arrived_at, e.workshop_days, e.workshop_ongoing, e.last_observation, count(*) over ()
  from enriched e
  where p_min_workshop_days is null or e.workshop_days >= p_min_workshop_days
  order by e.urgent desc, e.workshop_ongoing desc, e.workshop_days desc, e.created_at, e.code
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

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
  p_offset integer default 0,
  p_origin public.restoration_origin default null
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
      and (p_status is null or r.status = p_status)
      -- Logística no filtra por dinero (no lo ve).
      and (p_payment_status is null or (role.r in ('admin', 'ventas') and r.payment_status = p_payment_status))
      and (p_payment_type is null or r.payment_type = p_payment_type)
      and (p_client_id is null or r.client_id = p_client_id)
      and (p_origin is null or r.origin = p_origin)
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

-- 6. El registro ya no lee "arrived": oficina nace en la tienda, WhatsApp se marca al llegar.
create or replace function public.create_restoration(
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb
)
returns table (id uuid, code text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_restoration public.restorations;
  v_piece jsonb;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para registrar restauraciones' using errcode = '42501';
  end if;
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array'
     or jsonb_array_length(p_pieces) not between 1 and 100 then
    raise exception 'La restauración debe tener entre 1 y 100 piezas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '23503';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts k where k.id = p_contact_id and k.active
  ) then
    raise exception 'El contacto no existe o está desactivado' using errcode = '23503';
  end if;

  insert into public.restorations (client_id, contact_id, payment_type, deposit_percent, notes)
  values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, '')
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name,
      service_id, service_name, weight_grams, price, notes, urgent
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      (v_piece ->> 'price')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

create or replace function public.create_restoration_from_whatsapp_quote(
  p_quote_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_ids uuid[] := '{}'::uuid[];
  v_new uuid;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para registrar restauraciones' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'Elige el cliente de la restauración.' using errcode = '23514';
  end if;
  if p_pieces is null or jsonb_typeof(p_pieces) <> 'array'
     or jsonb_array_length(p_pieces) not between 1 and 100 then
    raise exception 'La restauración debe tener entre 1 y 100 piezas' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clients c where c.id = p_client_id and c.active) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '23503';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts k where k.id = p_contact_id and k.active and k.client_id = p_client_id
  ) then
    raise exception 'El contacto no existe, está desactivado o no es del cliente' using errcode = '23503';
  end if;

  select * into v_quote from public.whatsapp_quotes q where q.id = p_quote_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status = 'descartada' then
    raise exception 'La cotización está descartada: reábrela para pedir sus piezas.' using errcode = '23514';
  end if;
  if v_quote.client_id is not null and v_quote.client_id <> p_client_id then
    raise exception 'La cotización es de otro cliente.' using errcode = '23514';
  end if;
  if v_quote.client_id is null then
    update public.whatsapp_quotes q
    set client_id = p_client_id, contact_id = p_contact_id
    where q.id = v_quote.id;
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, notes, origin, whatsapp_quote_id
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, ''),
    'whatsapp',
    v_quote.id
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    v_item := nullif(v_piece ->> 'quote_item_id', '')::uuid;
    if v_item is not null then
      if v_item = any (v_seen) then
        raise exception 'Una pieza cotizada se eligió dos veces.' using errcode = '23514';
      end if;
      v_seen := v_seen || v_item;
      if not exists (
        select 1 from public.whatsapp_quote_items i where i.id = v_item and i.quote_id = v_quote.id
      ) then
        raise exception 'La pieza no es de esta cotización.' using errcode = '23514';
      end if;
      if exists (
        select 1 from public.pieces p
        where p.whatsapp_quote_item_id = v_item and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
      ) then
        raise exception 'Una de las piezas ya se pidió en otra restauración.' using errcode = '23514';
      end if;
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name,
      service_id, service_name, weight_grams, price, notes, urgent,
      whatsapp_quote_item_id
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      (v_piece ->> 'price')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
    v_ids := v_ids || v_new;
  end loop;

  -- El cliente confirmó: las piezas entran Aprobadas (P46, Q2).
  perform public.change_piece_status(v_ids, 'aprobada');

  return query select v_restoration.id, v_restoration.code;
end;
$$;
