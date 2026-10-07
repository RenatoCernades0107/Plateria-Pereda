-- Estados nuevos de la pieza (P47, Paso 8.6). Reemplaza parte de
-- 20261005024909_estados_piezas.sql, 20261005025725_asignar_taller.sql y
-- 20261005043935_listados.sql:
--   * se quitan "recibida" y "devuelta_taller": la llegada a la tienda y la vuelta del
--     taller son acciones que cambian la ubicación, no el estado (quedan en el
--     historial como eventos);
--   * nuevos estados finales "rechazada" (el cliente o la tienda no aceptan) y
--     "sin_arreglo"; como "anulada", no se cobran;
--   * "Devolver al cliente" (returned_at) para las rechazadas o sin arreglo que están
--     en la tienda;
--   * marca "urgent" por pieza (no es un estado);
--   * la ubicación "por_recibir" pasa a "sin_enviar".
-- Postgres no borra valores de un enum: se recrea piece_status y se convierten los
-- datos (recibida → aprobada; devuelta_taller → enviada_taller ya de vuelta).

-- 1. Tipos.
alter type public.piece_location rename value 'por_recibir' to 'sin_enviar';

create type public.piece_event as enum ('estado', 'llegada', 'vuelta_taller', 'devolucion_cliente');

alter type public.piece_status rename to piece_status_old;
create type public.piece_status as enum (
  'registrada', 'en_consulta', 'en_espera', 'aprobada', 'enviada_taller', 'observada',
  'entregada', 'rechazada', 'sin_arreglo', 'anulada'
);

-- 2. Lo que depende del tipo viejo o de las columnas que cambian se vuelve a crear abajo.
drop view public.piece_metrics;
drop view public.pieces_operational;
drop function public.piece_logistics_info(uuid);
drop function public.list_pieces_board(text, public.piece_location, public.piece_status_old, uuid, integer, integer, integer);
drop function public.change_piece_status(uuid[], public.piece_status_old, text, uuid);
drop function public.mark_pieces_arrived(uuid[]);
drop function public.fulfillment_days(public.piece_status_old, timestamptz, timestamptz, timestamptz);
drop function public.derive_piece_location(public.piece_status_old, timestamptz);
drop function private.add_status_history(public.pieces, public.piece_status_old, public.piece_status_old, text);
drop trigger pieces_recalculate_total on public.pieces;
drop trigger pieces_sync_restoration_status on public.pieces;
alter table public.pieces drop column location;
alter table public.pieces drop column received_at;

-- 3. Columnas nuevas.
alter table public.pieces
  add column urgent boolean not null default false,
  add column last_sent_at timestamptz,
  add column returned_at timestamptz,
  add column returned_by uuid references public.profiles (id) on delete set null;

alter table public.piece_status_history
  add column event public.piece_event not null default 'estado';

comment on column public.pieces.urgent is 'Marca "Urgente" (P47): no es un estado.';
comment on column public.pieces.last_sent_at is 'Último envío al taller (Interno).';
comment on column public.pieces.returned_at is
  'Devolución al cliente de una pieza rechazada o sin arreglo (P47).';
comment on column public.piece_status_history.event is
  'estado = cambio de estado; llegada, vuelta_taller y devolucion_cliente no cambian el estado.';

-- 4. Conversión de los datos.
update public.piece_status_history
set event = case to_status::text
  when 'recibida' then 'llegada'
  when 'devuelta_taller' then 'vuelta_taller'
  else 'estado'
end::public.piece_event;

-- La auditoría pide un id por fila y esta tabla tiene clave compuesta: la siembra no
-- se audita (igual que la inicial, que se hizo antes de activar la auditoría).
alter table public.piece_status_transitions disable trigger audit_changes;
delete from public.piece_status_transitions;

alter table public.pieces alter column status drop default;
alter table public.pieces alter column status type public.piece_status using (
  case status::text
    when 'recibida' then 'aprobada'
    when 'devuelta_taller' then 'enviada_taller'
    else status::text
  end
)::public.piece_status;
alter table public.pieces alter column status set default 'registrada';

alter table public.piece_status_history
  alter column from_status type public.piece_status using (
    case from_status::text
      when 'recibida' then 'aprobada'
      when 'devuelta_taller' then 'enviada_taller'
      else from_status::text
    end
  )::public.piece_status,
  alter column to_status type public.piece_status using (
    case to_status::text
      when 'recibida' then 'aprobada'
      when 'devuelta_taller' then 'enviada_taller'
      else to_status::text
    end
  )::public.piece_status;

alter table public.piece_status_transitions
  alter column from_status type public.piece_status using from_status::text::public.piece_status,
  alter column to_status type public.piece_status using to_status::text::public.piece_status;

drop type public.piece_status_old;

update public.pieces p set last_sent_at = (
  select max(h.occurred_at) from public.piece_status_history h
  where h.piece_id = p.id and h.event = 'estado' and h.to_status = 'enviada_taller'
)
where p.first_sent_at is not null;

-- 5. Columnas generadas: lista para entregar y ubicación (§7.2). Iguales a
-- deriveLocation() de restoration-status.ts.
alter table public.pieces add column ready_for_delivery boolean generated always as (
  status = 'enviada_taller' and last_returned_at is not null and last_sent_at is not null
    and last_returned_at >= last_sent_at
) stored;

alter table public.pieces add column location public.piece_location generated always as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when status = 'enviada_taller' and not (
      last_returned_at is not null and last_sent_at is not null and last_returned_at >= last_sent_at
    ) then 'en_taller'::public.piece_location
    when status = 'enviada_taller' or arrived_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end
) stored;

select audit.enable('public.pieces', '{location,ready_for_delivery}');

grant insert (urgent) on public.pieces to authenticated;
grant update (urgent) on public.pieces to authenticated;

-- 6. Transiciones (§7.1). Idéntica a PIECE_TRANSITIONS de TypeScript. Las acciones que
-- no cambian el estado (llegada, vuelta del taller, devolución) tienen su propio RPC.
insert into public.piece_status_transitions (from_status, to_status, roles, requires_note, requires_workshop) values
  ('registrada', 'en_consulta', '{admin,ventas}', true, false),
  ('registrada', 'aprobada', '{admin,ventas}', false, false),
  ('en_consulta', 'en_espera', '{admin,ventas}', false, false),
  ('en_espera', 'aprobada', '{admin,ventas}', false, false),
  ('registrada', 'rechazada', '{admin,ventas}', true, false),
  ('en_consulta', 'rechazada', '{admin,ventas}', true, false),
  ('en_espera', 'rechazada', '{admin,ventas}', true, false),
  ('en_consulta', 'sin_arreglo', '{admin,ventas}', true, false),
  ('aprobada', 'enviada_taller', '{admin,logistica}', false, true),
  ('enviada_taller', 'sin_arreglo', '{admin,ventas,logistica}', true, false),
  ('enviada_taller', 'entregada', '{admin,ventas,logistica}', false, false),
  ('enviada_taller', 'observada', '{admin,ventas,logistica}', true, false),
  ('entregada', 'observada', '{admin,ventas,logistica}', true, false),
  ('observada', 'enviada_taller', '{admin,logistica}', false, true),
  ('observada', 'entregada', '{admin,ventas,logistica}', false, false),
  ('registrada', 'anulada', '{admin,ventas}', true, false),
  ('en_consulta', 'anulada', '{admin,ventas}', true, false),
  ('en_espera', 'anulada', '{admin,ventas}', true, false),
  ('aprobada', 'anulada', '{admin,ventas}', true, false),
  -- P41 (d): una pieza que está en el taller solo la anula el administrador.
  ('enviada_taller', 'anulada', '{admin}', true, false),
  ('observada', 'anulada', '{admin,ventas}', true, false);

alter table public.piece_status_transitions enable trigger audit_changes;

-- 7. Historial.
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
    case when p_to = 'enviada_taller' and p_event = 'estado' then p_piece.workshop_id end,
    (select full_name from public.profiles where id = auth.uid()),
    p_event
  );
$$;

revoke execute on function private.add_status_history(public.pieces, public.piece_status, public.piece_status, text, public.piece_event)
  from public, anon, authenticated;

-- 8. Total: suma de las piezas que se cobran (sin anuladas, rechazadas ni sin arreglo).
create or replace function private.recalculate_restoration_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restorations r
  set total = coalesce((
    select sum(p.price) from public.pieces p
    where p.restoration_id = r.id and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
  ), 0)
  where r.id in (new.restoration_id);
  return null;
end;
$$;

create trigger pieces_recalculate_total
  after insert or update of price, status on public.pieces
  for each row execute function private.recalculate_restoration_total();

-- 9. Cambio de estado de una o varias piezas.
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
      where r.id = v_piece.restoration_id and r.status in ('completada', 'anulada')
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

revoke execute on function public.change_piece_status(uuid[], public.piece_status, text, uuid)
  from public, anon;
grant execute on function public.change_piece_status(uuid[], public.piece_status, text, uuid)
  to authenticated;

-- 10. Acciones que no cambian el estado. Las tres dejan un evento en el historial.

-- Llegada física a la tienda (todos los roles), antes de ir al taller.
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
      where r.id = v_piece.restoration_id and r.status in ('completada', 'anulada')
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

revoke execute on function public.mark_pieces_arrived(uuid[]) from public, anon;
grant execute on function public.mark_pieces_arrived(uuid[]) to authenticated;

-- "Recibir del taller" (admin y logística): la pieza sigue en Interno, ya en la
-- tienda y lista para entregar.
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
      where r.id = v_piece.restoration_id and r.status in ('completada', 'anulada')
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

revoke execute on function public.receive_from_workshop(uuid[]) from public, anon;
grant execute on function public.receive_from_workshop(uuid[]) to authenticated;

-- "Devolver al cliente" (todos los roles): pieza rechazada o sin arreglo que está en
-- la tienda. No toca Shopify ni pide el saldo.
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
      where r.id = v_piece.restoration_id and r.status in ('completada', 'anulada')
    ) then
      raise exception 'Tu rol no puede devolver esta pieza.' using errcode = '42501';
    end if;
    if v_piece.status not in ('rechazada', 'sin_arreglo') or v_piece.returned_at is not null
       or v_piece.location <> 'en_tienda' then
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

revoke execute on function public.return_pieces_to_client(uuid[]) from public, anon;
grant execute on function public.return_pieces_to_client(uuid[]) to authenticated;

-- 11. Derivados, iguales a restoration-status.ts y piece-days.ts.
create or replace function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz,
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
    when p_status = 'enviada_taller' and not (
      p_last_returned_at is not null and p_last_sent_at is not null and p_last_returned_at >= p_last_sent_at
    ) then 'en_taller'::public.piece_location
    when p_status = 'enviada_taller' or p_arrived_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end;
$$;

-- p_pieces: [{ "status", "approvedAt", "firstSentAt", "readyForDelivery" }, …]
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
      case when exists (select 1 from p) then 'anulada' else 'registrada' end
    when (select bool_and(status = 'entregada') from a) then 'completada'
    when (select bool_and(ready or status = 'entregada') from a) then 'lista'
    when (select bool_or(ready or status = 'entregada') from a) then 'parcialmente_lista'
    when (select bool_or(sent) from a) then 'en_proceso'
    when (select bool_and(approved) from a) then 'aprobada'
    else 'registrada'
  end::public.restoration_status;
$$;

create or replace function public.is_ready_for_shopify_order(p_pieces jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and((e ->> 'approvedAt') is not null), false)
  from jsonb_array_elements(coalesce(p_pieces, '[]')) e
  where e ->> 'status' not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

-- p_history: [{ "event", "from", "to", "at" }, …]. Igual a daysInWorkshop(): cada
-- envío al taller hasta su "Recibir del taller" (o un cambio de estado fuera de
-- Interno, como "No tiene arreglo" o "Anulado"); si sigue en el taller, hasta ahora.
create or replace function public.workshop_days(p_history jsonb, p_now timestamptz)
returns table (days integer, ongoing boolean)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_entry record;
  v_sent timestamptz;
  v_days integer := 0;
begin
  for v_entry in
    select coalesce(e ->> 'event', 'estado') as event, e ->> 'to' as to_status,
      (e ->> 'at')::timestamptz as at
    from jsonb_array_elements(coalesce(p_history, '[]')) with ordinality as x(e, ord)
    order by (e ->> 'at')::timestamptz, ord
  loop
    if v_entry.event = 'estado' and v_entry.to_status = 'enviada_taller' then
      v_sent := coalesce(v_sent, v_entry.at);
    elsif v_sent is not null and (
      v_entry.event = 'vuelta_taller'
      or (v_entry.event = 'estado' and v_entry.to_status <> 'enviada_taller')
    ) then
      v_days := v_days + public.lima_days_between(v_sent, v_entry.at);
      v_sent := null;
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

-- Igual a fulfillmentDays(): sin días para las piezas finales que no se cobran.
create or replace function public.fulfillment_days(
  p_status public.piece_status,
  p_registered_at timestamptz,
  p_delivered_at timestamptz,
  p_now timestamptz
)
returns table (days integer, ongoing boolean)
language sql
stable
set search_path = ''
as $$
  select public.lima_days_between(p_registered_at, p_delivered_at), false
  where p_status = 'entregada' and p_delivered_at is not null
  union all
  select public.lima_days_between(p_registered_at, p_now), true
  where p_status not in ('anulada', 'rechazada', 'sin_arreglo')
    and not (p_status = 'entregada' and p_delivered_at is not null);
$$;

revoke execute on function public.workshop_days(jsonb, timestamptz) from public, anon;
revoke execute on function public.fulfillment_days(public.piece_status, timestamptz, timestamptz, timestamptz) from public, anon;
revoke execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.workshop_days(jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.fulfillment_days(public.piece_status, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

-- Historial de una pieza en el formato de workshop_days().
create or replace function private.piece_history_json(p_piece_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'event', h.event, 'from', h.from_status, 'to', h.to_status, 'at', h.occurred_at)
    order by h.occurred_at, h.id), '[]')
  from public.piece_status_history h where h.piece_id = p_piece_id;
$$;

revoke execute on function private.piece_history_json(uuid) from public, anon;
grant execute on function private.piece_history_json(uuid) to authenticated, service_role;

-- 12. Estado general y orden de Shopify.
create or replace function private.sync_restoration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces jsonb;
  v_restoration public.restorations;
  v_next public.restoration_status;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
      'readyForDelivery', p.ready_for_delivery)), '[]')
  into v_pieces
  from public.pieces p where p.restoration_id = new.restoration_id;

  select * into v_restoration from public.restorations where id = new.restoration_id for update;
  v_next := public.advance_restoration_status(
    v_restoration.status, public.derive_restoration_status(v_pieces)
  );
  if v_next is distinct from v_restoration.status then
    update public.restorations r set status = v_next
    where r.id = v_restoration.id
    returning * into v_restoration;
  end if;

  -- Todas las piezas que se cobran aprobadas y sin orden: se encola su creación una
  -- sola vez (un job con error se reintenta desde "Reintentar", no se duplica).
  if v_restoration.shopify_order_id is null
     and public.is_ready_for_shopify_order(v_pieces)
     and not exists (
       select 1 from public.shopify_sync_jobs j
       where j.kind = 'order.create' and j.entity_table = 'restorations'
         and j.entity_id = v_restoration.id::text
     ) then
    perform private.enqueue_shopify_job(
      'order.create', 'restorations', v_restoration.id::text, '{}', 'order:' || v_restoration.id
    );
  end if;
  return null;
end;
$$;

create trigger pieces_sync_restoration_status
  after insert or update of status, approved_at, first_sent_at, last_sent_at, last_returned_at
  on public.pieces
  for each row execute function private.sync_restoration_status();

-- 13. Edición: las piezas finales no se editan; de una entregada solo las notas.
create or replace function private.guard_piece_edit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status in ('anulada', 'rechazada', 'sin_arreglo') and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.price, new.workshop_id, new.notes, new.urgent
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.price, old.workshop_id, old.notes, old.urgent
  ) then
    raise exception 'Una pieza anulada, rechazada o sin arreglo no se puede editar'
      using errcode = '23514';
  end if;

  if old.status = 'entregada' and (
    new.description, new.measure, new.material_id, new.material_name, new.service_id,
    new.service_name, new.weight_grams, new.price, new.workshop_id, new.urgent
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.price, old.workshop_id, old.urgent
  ) then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if new.price is distinct from old.price
     and coalesce(current_setting('app.shopify_order_edit', true), '') <> 'on'
     and exists (
       select 1 from public.restorations
       where id = new.restoration_id and shopify_order_id is not null
     ) then
    raise exception 'Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 14. Taller: no se cambia en piezas en el taller, entregadas ni finales.
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
    where p.id = any (p_piece_ids) and r.status in ('completada', 'anulada')
  ) then
    raise exception 'Tu rol no puede asignar talleres.' using errcode = '42501';
  end if;

  update public.pieces p set workshop_id = p_workshop_id
  where p.id = any (p_piece_ids) and p.workshop_id is distinct from p_workshop_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- 15. Vistas sin dinero (P42, D24) y métricas.
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
    or r.status not in ('completada', 'anulada')
  );

comment on view public.pieces_operational is
  'Piezas sin precio (P42). Logística no ve las de restauraciones pasadas (D24).';

revoke all on public.pieces_operational from anon, authenticated;
grant select on public.pieces_operational to authenticated;

create view public.piece_metrics
with (security_invoker = true)
as
select p.id as piece_id, p.restoration_id, p.code, p.status,
  w.days as workshop_days, w.ongoing as workshop_ongoing,
  f.days as fulfillment_days, f.ongoing as fulfillment_ongoing
from public.pieces p
cross join lateral public.workshop_days((
  select coalesce(jsonb_agg(jsonb_build_object(
      'event', h.event, 'from', h.from_status, 'to', h.to_status, 'at', h.occurred_at)
    order by h.occurred_at, h.id), '[]')
  from public.piece_status_history h where h.piece_id = p.id
), now()) w
left join lateral public.fulfillment_days(p.status, p.created_at, p.delivered_at, now()) f on true;

revoke all on public.piece_metrics from anon, authenticated;
grant select on public.piece_metrics to authenticated;

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

revoke execute on function public.piece_logistics_info(uuid) from public, anon;
grant execute on function public.piece_logistics_info(uuid) to authenticated;

-- 16. Vista operativa de piezas: piezas en curso y las rechazadas o sin arreglo que
-- siguen en la tienda (por devolver). Urgentes primero.
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
      (p.status in ('rechazada', 'sin_arreglo') and p.location = 'en_tienda') as to_return
    from public.pieces p
    join public.restorations r on r.id = p.restoration_id
    join public.clients c on c.id = r.client_id
    left join public.workshops w on w.id = p.workshop_id
    where private.current_app_role() is not null
      and p.status not in ('entregada', 'anulada')
      and not (p.status in ('rechazada', 'sin_arreglo') and p.location <> 'en_tienda')
      and r.status not in ('completada', 'anulada')
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

revoke execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean) from public, anon;
grant execute on function public.list_pieces_board(text, public.piece_location, public.piece_status, uuid,
  integer, integer, integer, boolean, boolean, boolean) to authenticated;

comment on table public.piece_status_transitions is
  'Transiciones de estado de la pieza (§7.1, P47). Idéntica a PIECE_TRANSITIONS de TypeScript.';

-- 17. El registro guarda la marca "Urgente" de cada pieza (p_pieces[].urgent).
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
      service_id, service_name, weight_grams, price, notes, arrived_at, urgent
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
      case when coalesce((v_piece ->> 'arrived')::boolean, false) then now() end,
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;
