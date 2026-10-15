-- Revisión en taller (pedido del 2026-10-15): una pieza en Consulta (o esperando la
-- respuesta del cliente) se puede llevar al taller para que la revisen, sin cambiar
-- su estado.
--   * "Llevar al taller a revisar" (se elige el taller) y "Volvió de revisión": la
--     ubicación pasa a En taller y luego a En tienda; ambas quedan en el historial.
--   * Si el cliente aprueba mientras está en el taller, la pieza pasa directo a En
--     restauración en el mismo taller, sin traerla de vuelta. Para cerrarla (No tiene
--     arreglo, Anulado o Rechazado) primero se marca que volvió.
--   * Los días de la revisión cuentan como días en taller (y para la alerta de 7+ días).
--
-- Revisión abierta: review_sent_at y sin vuelta posterior
--   review_sent_at is not null and (review_returned_at is null or review_returned_at < review_sent_at)

-- 1. Fechas de la revisión.
alter table public.pieces
  add column review_sent_at timestamptz,
  add column review_returned_at timestamptz;

comment on column public.pieces.review_sent_at is
  'Último "Llevar al taller a revisar" (revisión en taller, sin cambiar el estado).';
comment on column public.pieces.review_returned_at is
  'Último "Volvió de revisión" (o el paso directo a En restauración desde la revisión).';

create or replace function private.review_open(p_sent_at timestamptz, p_returned_at timestamptz)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_sent_at is not null and (p_returned_at is null or p_returned_at < p_sent_at);
$$;

revoke execute on function private.review_open(timestamptz, timestamptz) from public, anon;
grant execute on function private.review_open(timestamptz, timestamptz) to authenticated, service_role;

-- 2. Ubicación (§7.2): con la revisión abierta la pieza está En taller; de vuelta de la
-- revisión, En tienda. El resto, igual que en rechazo_y_observacion.
alter table public.pieces alter column location set expression as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when arrived_at is null then 'por_whatsapp'::public.piece_location
    when status = 'observada' then 'sin_enviar'::public.piece_location
    when review_sent_at is not null
      and (review_returned_at is null or review_returned_at < review_sent_at)
      and status in ('en_consulta', 'en_espera', 'aprobada')
      then 'en_taller'::public.piece_location
    when status = 'enviada_taller' and not (
      last_returned_at is not null and last_sent_at is not null and last_returned_at >= last_sent_at
    ) then 'en_taller'::public.piece_location
    when first_sent_at is not null or review_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end
);

drop function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz);
create function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz,
  p_first_sent_at timestamptz default null,
  p_last_sent_at timestamptz default null,
  p_last_returned_at timestamptz default null,
  p_returned_at timestamptz default null,
  p_review_sent_at timestamptz default null,
  p_review_returned_at timestamptz default null
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
    when p_status = 'observada' then 'sin_enviar'::public.piece_location
    when p_review_sent_at is not null
      and (p_review_returned_at is null or p_review_returned_at < p_review_sent_at)
      and p_status in ('en_consulta', 'en_espera', 'aprobada')
      then 'en_taller'::public.piece_location
    when p_status = 'enviada_taller' and not (
      p_last_returned_at is not null and p_last_sent_at is not null and p_last_returned_at >= p_last_sent_at
    ) then 'en_taller'::public.piece_location
    when p_first_sent_at is not null or p_review_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end;
$$;

revoke execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

-- 3. La vista operativa expone las fechas de la revisión (la interfaz sabe si está abierta).
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 4. Historial: el envío a revisión guarda el taller, como el envío a restauración.
create or replace function private.add_status_history(
  p_piece public.pieces,
  p_from public.piece_status,
  p_to public.piece_status,
  p_note text,
  p_event public.piece_event default 'estado'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.piece_status_history
    (piece_id, restoration_id, from_status, to_status, note, workshop_id, actor_name, event)
  values (
    p_piece.id, p_piece.restoration_id, p_from, p_to, nullif(trim(p_note), ''),
    case
      when (p_to = 'enviada_taller' and p_event = 'estado') or p_event = 'envio_revision'
        then p_piece.workshop_id
    end,
    (select full_name from public.profiles where id = auth.uid()),
    p_event
  );
$$;

-- 5. Días en taller: igual a daysInWorkshop(). La revisión abre un viaje que termina
-- con "Volvió de revisión"; mientras sigue abierta, pasar a Espera respuesta cliente o
-- Aprobada no lo corta y pasar a En restauración lo continúa (mismo viaje).
create or replace function public.workshop_days(p_history jsonb, p_now timestamptz)
returns table (days integer, ongoing boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_entry record;
  v_sent timestamptz;
  v_review boolean := false;
  v_days integer := 0;
begin
  for v_entry in
    select coalesce(e ->> 'event', 'estado') as event, e ->> 'to' as to_status,
      (e ->> 'at')::timestamptz as at
    from jsonb_array_elements(coalesce(p_history, '[]')) with ordinality as x(e, ord)
    order by (e ->> 'at')::timestamptz, ord
  loop
    if v_entry.event = 'envio_revision' then
      v_sent := coalesce(v_sent, v_entry.at);
      v_review := true;
    elsif v_entry.event = 'estado' and v_entry.to_status = 'enviada_taller' then
      v_sent := coalesce(v_sent, v_entry.at);
      v_review := false;
    elsif v_review and v_entry.event = 'estado' and v_entry.to_status in ('en_espera', 'aprobada') then
      null; -- sigue en el taller por la revisión
    elsif v_sent is not null and (
      v_entry.event in ('vuelta_taller', 'vuelta_revision')
      or (v_entry.event = 'estado' and v_entry.to_status <> 'enviada_taller')
    ) then
      v_days := v_days + public.lima_days_between(v_sent, v_entry.at);
      v_sent := null;
      v_review := false;
    end if;
  end loop;
  if v_sent is not null then
    days := v_days + public.lima_days_between(v_sent, p_now);
    ongoing := true;
  else
    days := v_days;
    ongoing := false;
  end if;
  return next;
end;
$$;

-- 6. "Llevar al taller a revisar" (admin y logística, como Recibir del taller).
create function public.send_pieces_for_review(p_piece_ids uuid[], p_workshop_id uuid)
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
    raise exception 'Tu rol no puede llevar piezas al taller.' using errcode = '42501';
  end if;
  if p_workshop_id is null then
    raise exception 'Elige el taller al que se lleva la pieza.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.workshops w where w.id = p_workshop_id and w.active) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;
  for v_piece in
    select * from public.pieces p where p.id = any (p_piece_ids) order by p.id for update
  loop
    if v_role = 'logistica' and exists (
      select 1 from public.restorations r
      where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
    ) then
      raise exception 'Tu rol no puede llevar piezas al taller.' using errcode = '42501';
    end if;
    if v_piece.status not in ('en_consulta', 'en_espera') then
      raise exception 'La pieza % no está en Consulta ni esperando respuesta del cliente.', v_piece.code
        using errcode = '23514';
    end if;
    if v_piece.arrived_at is null then
      raise exception 'La pieza % aún no llegó a la tienda.', v_piece.code using errcode = '23514';
    end if;
    if private.review_open(v_piece.review_sent_at, v_piece.review_returned_at) then
      raise exception 'La pieza % ya está en el taller por revisión.', v_piece.code using errcode = '23514';
    end if;
    update public.pieces p set
      workshop_id = p_workshop_id,
      review_sent_at = now(),
      review_returned_at = null
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'envio_revision');
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

revoke execute on function public.send_pieces_for_review(uuid[], uuid) from public, anon;
grant execute on function public.send_pieces_for_review(uuid[], uuid) to authenticated;

-- 7. "Volvió de revisión" (admin y logística): la pieza vuelve a la tienda, mismo estado.
create function public.receive_pieces_from_review(p_piece_ids uuid[])
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
    if not private.review_open(v_piece.review_sent_at, v_piece.review_returned_at) then
      raise exception 'La pieza % no está en el taller por revisión.', v_piece.code using errcode = '23514';
    end if;
    update public.pieces p set review_returned_at = now()
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'vuelta_revision');
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

revoke execute on function public.receive_pieces_from_review(uuid[]) from public, anon;
grant execute on function public.receive_pieces_from_review(uuid[]) to authenticated;

-- 8. Cambio de estado (copia de ubicaciones_y_rechazada) con la revisión abierta:
--    * no se cierra la pieza (No tiene arreglo, Anulado, Rechazado) hasta marcar que volvió;
--    * Aprobada → En restauración sigue en el mismo taller y cierra la revisión.
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
  v_review boolean;
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
    -- Revisión en taller: se cierra solo lo que ya volvió a la tienda.
    v_review := private.review_open(v_piece.review_sent_at, v_piece.review_returned_at);
    if v_review and p_to in ('sin_arreglo', 'anulada', 'rechazada') then
      raise exception 'La pieza % está en el taller por revisión; marca primero que volvió.', v_piece.code
        using errcode = '23514';
    end if;
    -- Desde la revisión pasa a En restauración en el mismo taller.
    if v_review and p_to = 'enviada_taller' and p_workshop_id is not null
       and p_workshop_id is distinct from v_piece.workshop_id then
      raise exception 'La pieza % está en revisión en otro taller; marca primero que volvió.', v_piece.code
        using errcode = '23514';
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
      cancelled_at = case when p_to in ('anulada', 'rechazada', 'sin_arreglo') then now() else p.cancelled_at end,
      review_returned_at = case when v_review and p_to = 'enviada_taller' then now() else p.review_returned_at end
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

-- 9. El taller no se cambia mientras la pieza está en el taller por revisión.
create or replace function public.assign_piece_workshop(p_piece_ids uuid[], p_workshop_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Solo logística y el administrador asignan el taller.' using errcode = '42501';
  end if;
  if p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.pieces p
    where p.id = any (p_piece_ids)
      and (
        p.status in ('enviada_taller', 'entregada', 'anulada', 'rechazada', 'sin_arreglo')
        or private.review_open(p.review_sent_at, p.review_returned_at)
      )
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

-- 10. Vista de piezas: agrega las fechas de la revisión (la interfaz ofrece "Volvió de
-- revisión" y no ofrece cerrar la pieza). Cambian las columnas: se recrea con la misma
-- firma y el mismo cuerpo que piezas_entregadas_hoy_e_historial.
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
  review_sent_at timestamptz,
  review_returned_at timestamptz,
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
    e.review_sent_at, e.review_returned_at,
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
  integer, integer, integer, boolean, boolean, boolean, text) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean, text) to authenticated;
