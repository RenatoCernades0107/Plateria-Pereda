-- Cerrar la pieza con la revisión en taller abierta (2026-11-13).
--
-- Rechazar (el cliente), anular y "No tiene arreglo" (el taller avisa) son decisiones
-- sobre la pieza, no sobre dónde está: se pueden tomar con la pieza todavía en el taller
-- por revisión. Antes `change_piece_status` exigía marcar primero "Volvió de revisión".
--
-- Lo que sí depende de la ubicación es devolver la pieza al cliente: una pieza cerrada con
-- la revisión abierta sigue En taller y no se devuelve hasta que vuelve.

-- 1. Ubicación: la revisión abierta mantiene la pieza En taller también cuando ya está
-- cerrada por rechazo o sin arreglo (la devuelta ya es "Entregada", se evalúa antes).
create or replace function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz,
  p_first_sent_at timestamptz default null,
  p_last_sent_at timestamptz default null,
  p_last_returned_at timestamptz default null,
  p_returned_at timestamptz default null,
  p_review_sent_at timestamptz default null,
  p_review_returned_at timestamptz default null,
  p_observed_at timestamptz default null
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
    when p_review_sent_at is not null
      and (p_review_returned_at is null or p_review_returned_at < p_review_sent_at)
      and p_status in ('en_consulta', 'en_espera', 'aprobada', 'rechazada', 'sin_arreglo')
      then 'en_taller'::public.piece_location
    when p_status in ('aprobada', 'observada')
      and p_last_sent_at is not null
      and (p_last_returned_at is null or p_last_returned_at < p_last_sent_at)
      and (p_status = 'aprobada' or p_observed_at is null or p_last_sent_at > p_observed_at)
      then 'en_taller'::public.piece_location
    when p_status in ('aprobada', 'observada')
      and p_last_sent_at is not null
      and p_last_returned_at is not null
      and p_last_returned_at >= p_last_sent_at
      and (p_status = 'aprobada' or p_observed_at is null or p_last_sent_at > p_observed_at)
      then 'en_tienda'::public.piece_location
    when p_status = 'observada' then 'sin_enviar'::public.piece_location
    when p_status = 'aprobada' and p_first_sent_at is null then 'sin_enviar'::public.piece_location
    when p_first_sent_at is not null or p_review_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end;
$$;

alter table public.pieces alter column location set expression as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when arrived_at is null then 'por_whatsapp'::public.piece_location
    -- Revisión abierta (también si ya se rechazó o quedó sin arreglo).
    when review_sent_at is not null
      and (review_returned_at is null or review_returned_at < review_sent_at)
      and status in ('en_consulta', 'en_espera', 'aprobada', 'rechazada', 'sin_arreglo')
      then 'en_taller'::public.piece_location
    -- Enviada al taller y aún sin volver.
    when status in ('aprobada', 'observada')
      and last_sent_at is not null
      and (last_returned_at is null or last_returned_at < last_sent_at)
      and (status = 'aprobada' or observed_at is null or last_sent_at > observed_at)
      then 'en_taller'::public.piece_location
    -- Lista para entregar.
    when status in ('aprobada', 'observada')
      and last_sent_at is not null
      and last_returned_at is not null
      and last_returned_at >= last_sent_at
      and (status = 'aprobada' or observed_at is null or last_sent_at > observed_at)
      then 'en_tienda'::public.piece_location
    -- Observada sin envío posterior, o Aprobada que aún no fue al taller: por enviar.
    when status = 'observada' then 'sin_enviar'::public.piece_location
    when status = 'aprobada' and first_sent_at is null then 'sin_enviar'::public.piece_location
    when first_sent_at is not null or review_sent_at is not null then 'en_tienda'::public.piece_location
    else 'sin_enviar'::public.piece_location
  end
);

-- 2. Cambio de estado: igual que antes, sin la regla que impedía cerrar la pieza mientras
-- la revisión seguía abierta.
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
  v_in_workshop boolean;
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

    v_review := private.review_open(v_piece.review_sent_at, v_piece.review_returned_at);
    v_in_workshop := private.piece_in_workshop(
      v_piece.status, v_piece.last_sent_at, v_piece.last_returned_at, v_piece.observed_at
    );
    -- Desde Aprobada solo se entrega u observa lo que ya volvió del taller (P47).
    if v_piece.status = 'aprobada' and p_to in ('entregada', 'observada')
       and not v_piece.ready_for_delivery then
      if v_review or v_in_workshop or v_piece.first_sent_at is not null then
        raise exception 'La pieza % sigue en el taller.', v_piece.code using errcode = '23514';
      end if;
      raise exception 'La pieza % aún no pasó por el taller.', v_piece.code using errcode = '23514';
    end if;
    -- Sin arreglo desde Aprobada: lo decide el taller, así que ya tuvo que ir.
    if v_piece.status = 'aprobada' and p_to = 'sin_arreglo' and v_piece.first_sent_at is null then
      raise exception 'La pieza % aún no pasó por el taller.', v_piece.code using errcode = '23514';
    end if;
    -- Una Observada que se reenvió al taller se entrega cuando vuelve.
    if v_piece.status = 'observada' and p_to = 'entregada' and v_in_workshop then
      raise exception 'La pieza % sigue en el taller.', v_piece.code using errcode = '23514';
    end if;
    -- Anular lo que está en el taller: solo el administrador (como antes desde En restauración).
    if p_to = 'anulada' and v_in_workshop and v_role <> 'admin' then
      raise exception 'La pieza % está en el taller: solo el administrador la anula.', v_piece.code
        using errcode = '42501';
    end if;
    -- Rechazar, anular o dejar sin arreglo no depende de dónde está la pieza: se puede con
    -- la revisión abierta (la pieza sigue En taller hasta que se marque que volvió).
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
      observed_at = case when p_to = 'observada' then now() else p.observed_at end,
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

-- 3. Devolver al cliente: solo lo que está en la tienda. Una pieza cerrada con la revisión
-- abierta sigue en el taller y se devuelve cuando vuelve.
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
    if v_piece.status in ('rechazada', 'sin_arreglo') and v_piece.returned_at is null
       and private.review_open(v_piece.review_sent_at, v_piece.review_returned_at) then
      raise exception 'La pieza % sigue en el taller por revisión; marca primero que volvió.', v_piece.code
        using errcode = '23514';
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
