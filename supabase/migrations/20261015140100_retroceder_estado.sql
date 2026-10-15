-- Retroceder el estado de una pieza (pedido del 2026-10-15): si alguien se equivoca,
-- "Retroceder estado" devuelve la pieza al estado anterior, un paso a la vez.
--   * El historial nunca se borra: el retroceso es un evento nuevo (`retroceso`, de
--     X a Y) con quién, cuándo y el motivo (obligatorio).
--   * El estado anterior sale del propio historial: cada cambio de estado apila un paso
--     y cada retroceso lo desapila, así se puede retroceder varias veces.
--   * Lo puede hacer quien podía hacer el avance (mismos roles de la transición); si esa
--     transición ya no existe en la tabla, solo el administrador.
--   * Las fechas que fijó el estado que se deja (aprobada, envío al taller, entrega,
--     cierre) vuelven a lo que decían antes; las demás acciones (llegada, vuelta del
--     taller, revisión) no se tocan.
--   * Los disparadores existentes mantienen el total, la orden de Shopify y el estado
--     de la cotización de WhatsApp. El estado general de la restauración, que solo
--     avanza (P19), retrocede aquí únicamente si estaba al día con sus piezas.

-- 1. Pasos vigentes del historial de estados de una pieza (los no deshechos), del más
-- antiguo al más reciente. El primero es el registro inicial (sin estado anterior).
create or replace function private.piece_status_steps(p_piece_id uuid)
returns table (step integer, from_status public.piece_status, to_status public.piece_status,
  occurred_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_row record;
  v_from public.piece_status[] := '{}';
  v_to public.piece_status[] := '{}';
  v_at timestamptz[] := '{}';
  v_n integer;
begin
  for v_row in
    select h.event, h.from_status, h.to_status, h.occurred_at
    from public.piece_status_history h
    where h.piece_id = p_piece_id and h.event in ('estado', 'retroceso')
    order by h.occurred_at, h.id
  loop
    if v_row.event = 'estado' then
      v_from := array_append(v_from, v_row.from_status);
      v_to := array_append(v_to, v_row.to_status);
      v_at := array_append(v_at, v_row.occurred_at);
    else
      v_n := cardinality(v_to);
      if v_n > 0 then
        v_from := v_from[1:v_n - 1];
        v_to := v_to[1:v_n - 1];
        v_at := v_at[1:v_n - 1];
      end if;
    end if;
  end loop;
  return query
    select x.ord::integer, x.f, x.t, x.a
    from unnest(v_from, v_to, v_at) with ordinality as x(f, t, a, ord)
    order by x.ord;
end;
$$;

revoke execute on function private.piece_status_steps(uuid) from public, anon;
grant execute on function private.piece_status_steps(uuid) to authenticated, service_role;

-- 2. Estado al que volvería la pieza (null si no hay: recién registrada o ya sin pasos).
-- Para la interfaz; también lo puede consultar logística, que no lee el historial.
create or replace function public.piece_previous_status(p_piece_id uuid)
returns public.piece_status
language sql
stable
security definer
set search_path = ''
as $$
  select s.from_status
  from private.piece_status_steps(p_piece_id) s
  join public.pieces p on p.id = p_piece_id and p.status = s.to_status
  where exists (select 1 from public.pieces_operational o where o.id = p_piece_id)
  order by s.step desc
  limit 1;
$$;

revoke execute on function public.piece_previous_status(uuid) from public, anon;
grant execute on function public.piece_previous_status(uuid) to authenticated;

-- 3. Piezas de la restauración en el formato de derive_restoration_status().
create or replace function private.restoration_pieces_json(p_restoration_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at,
      'readyForDelivery', p.ready_for_delivery, 'price', p.price)), '[]')
  from public.pieces p where p.restoration_id = p_restoration_id;
$$;

revoke execute on function private.restoration_pieces_json(uuid) from public, anon, authenticated;

-- 4. Retroceder el estado de la pieza al anterior.
create function public.undo_piece_status(p_piece_id uuid, p_note text)
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_closed constant public.piece_status[] := '{anulada,rechazada,sin_arreglo}';
  v_piece public.pieces;
  v_step record;
  v_rule public.piece_status_transitions;
  v_from public.piece_status;
  v_prev public.piece_status;
  v_allowed boolean;
  v_approved timestamptz;
  v_first_sent timestamptz;
  v_last_sent timestamptz;
  v_delivered timestamptz;
  v_restoration public.restorations;
  v_in_sync boolean;
  v_next public.restoration_status;
begin
  if v_role is null then
    raise exception 'Inicia sesión para cambiar estados' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Escribe el motivo del retroceso.' using errcode = '23514';
  end if;
  if length(v_note) > 1000 then
    raise exception 'La nota tiene más de 1000 caracteres' using errcode = '22023';
  end if;

  select * into v_piece from public.pieces p where p.id = p_piece_id for update;
  if v_piece.id is null then
    raise exception 'La pieza no existe' using errcode = '23503';
  end if;
  if v_role = 'logistica' and exists (
    select 1 from public.restorations r
    where r.id = v_piece.restoration_id and private.is_past_restoration(r.id, r.status)
  ) then
    raise exception 'Tu rol no puede retroceder este cambio de estado.' using errcode = '42501';
  end if;

  select s.step, s.from_status, s.to_status, s.occurred_at into v_step
  from private.piece_status_steps(p_piece_id) s
  order by s.step desc
  limit 1;
  if v_step.step is null or v_step.from_status is null
     or v_step.to_status is distinct from v_piece.status then
    raise exception 'La pieza % no tiene un estado anterior al que volver.', v_piece.code
      using errcode = '23514';
  end if;
  v_from := v_piece.status;
  v_prev := v_step.from_status;

  -- Quien podía hacer el avance puede deshacerlo; sin esa transición, solo el admin.
  select * into v_rule from public.piece_status_transitions t
  where t.from_status = v_prev and t.to_status = v_from;
  v_allowed := case when v_rule.from_status is null then v_role = 'admin'
    else v_role = any (v_rule.roles) end;
  if not v_allowed then
    raise exception 'Tu rol no puede retroceder este cambio de estado.' using errcode = '42501';
  end if;

  -- Una pieza ya devuelta al cliente no se reactiva.
  if v_from = any (v_closed) and v_piece.returned_at is not null then
    raise exception 'La pieza % ya se devolvió al cliente; no se puede reactivar.', v_piece.code
      using errcode = '23514';
  end if;

  -- Fechas que fijaba el estado que se deja, según los pasos que quedan.
  select max(s.occurred_at) filter (where s.to_status = 'aprobada'),
    min(s.occurred_at) filter (where s.to_status = 'enviada_taller'),
    max(s.occurred_at) filter (where s.to_status = 'enviada_taller'),
    max(s.occurred_at) filter (where s.to_status = 'entregada')
  into v_approved, v_first_sent, v_last_sent, v_delivered
  from private.piece_status_steps(p_piece_id) s
  where s.step < v_step.step;

  select * into v_restoration from public.restorations r
  where r.id = v_piece.restoration_id for update;
  v_in_sync := v_restoration.status
    = public.derive_restoration_status(private.restoration_pieces_json(v_piece.restoration_id));

  -- Volver a Entregada no pide saldo: ya se había entregado.
  perform set_config('app.deliver_with_balance', 'on', true);
  update public.pieces p set
    status = v_prev,
    approved_at = case when v_from = 'aprobada' then v_approved else p.approved_at end,
    first_sent_at = case when v_from = 'enviada_taller' then v_first_sent else p.first_sent_at end,
    last_sent_at = case when v_from = 'enviada_taller' then v_last_sent else p.last_sent_at end,
    delivered_at = case when v_from = 'entregada' then v_delivered else p.delivered_at end,
    cancelled_at = case when v_from = any (v_closed) then null else p.cancelled_at end,
    -- Si venía de una revisión que el paso a En restauración cerró, vuelve a quedar abierta.
    review_returned_at = case
      when v_from = 'enviada_taller' and p.review_returned_at = v_step.occurred_at then null
      else p.review_returned_at
    end
  where p.id = v_piece.id
  returning * into v_piece;
  perform set_config('app.deliver_with_balance', '', true);

  perform private.add_status_history(v_piece, v_from, v_prev, v_note, 'retroceso');

  -- El estado general solo avanza, salvo que estuviera al día con sus piezas (p. ej. se
  -- anuló o entregó la última pieza por error): entonces se vuelve a calcular.
  if v_in_sync then
    v_next := public.derive_restoration_status(
      private.restoration_pieces_json(v_piece.restoration_id)
    );
    update public.restorations r set status = v_next
    where r.id = v_piece.restoration_id and r.status is distinct from v_next;
  end if;

  piece_id := v_piece.id;
  status := v_piece.status;
  return next;
end;
$$;

revoke execute on function public.undo_piece_status(uuid, text) from public, anon;
grant execute on function public.undo_piece_status(uuid, text) to authenticated;

-- 5. Días en taller: igual a daysInWorkshop(). Un retroceso cuenta como un cambio de
-- estado que saca la pieza del taller (o la deja en revisión), pero nunca abre un viaje:
-- volver a En restauración no dice si la pieza sigue en el taller.
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
    elsif v_review and v_entry.event in ('estado', 'retroceso')
      and v_entry.to_status in ('en_espera', 'aprobada') then
      null; -- sigue en el taller por la revisión
    elsif v_sent is not null and (
      v_entry.event in ('vuelta_taller', 'vuelta_revision')
      or (v_entry.event in ('estado', 'retroceso') and v_entry.to_status <> 'enviada_taller')
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
