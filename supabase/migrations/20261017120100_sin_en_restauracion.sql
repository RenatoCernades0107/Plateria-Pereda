-- Sin el estado "En restauración" (`enviada_taller`, pedido del 2026-10-17).
-- Ir al taller deja de ser un estado y pasa a ser una ACCIÓN que cambia la ubicación,
-- como la revisión en taller:
--   * "Enviar al taller" (send_pieces_to_workshop) y "Recibir del taller"
--     (receive_from_workshop) valen para piezas Aprobadas u Observadas; el estado no
--     cambia, solo la ubicación (En taller ↔ En tienda) y el historial (envio_taller /
--     vuelta_taller).
--   * Desde Aprobada se entrega, se observa o se marca Sin arreglo cuando ya volvió del
--     taller. Una pieza Observada se puede reenviar al taller (reenvío por arreglo).
--   * Nueva fecha `observed_at`: cuándo entró la pieza a Observada por última vez. Una
--     Observada está lista para entregar solo si fue al taller DESPUÉS de observarse y
--     ya volvió.
--   * El valor 'enviada_taller' queda en el enum piece_status sin uso: quitarlo obligaría
--     a recrear el tipo y todo lo que lo usa (igual que 'en_proceso', sin_en_proceso).
--     Un check impide guardarlo.
--
-- Definiciones (las replica la interfaz en restoration-status.ts):
--   en el taller por trabajo ("enviada en curso"):
--     status in (aprobada, observada) and last_sent_at is not null
--     and (last_returned_at is null or last_returned_at < last_sent_at)
--     and (status = aprobada or observed_at is null or last_sent_at > observed_at)
--   lista para entregar (ready_for_delivery):
--     status in (aprobada, observada) and last_sent_at is not null
--     and last_returned_at >= last_sent_at
--     and (status = aprobada or observed_at is null or last_sent_at > observed_at)

-- 1. Fecha de la última observación.
alter table public.pieces add column observed_at timestamptz;

comment on column public.pieces.observed_at is
  'Última vez que la pieza entró a Observada. Una Observada está lista solo si fue al taller después.';

-- ¿La pieza está en el taller por trabajo (enviada y aún sin volver)?
create or replace function private.piece_in_workshop(
  p_status public.piece_status,
  p_last_sent_at timestamptz,
  p_last_returned_at timestamptz,
  p_observed_at timestamptz
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_status in ('aprobada', 'observada')
    and p_last_sent_at is not null
    and (p_last_returned_at is null or p_last_returned_at < p_last_sent_at)
    and (p_status = 'aprobada' or p_observed_at is null or p_last_sent_at > p_observed_at);
$$;

revoke execute on function private.piece_in_workshop(public.piece_status, timestamptz, timestamptz,
  timestamptz) from public, anon;
grant execute on function private.piece_in_workshop(public.piece_status, timestamptz, timestamptz,
  timestamptz) to authenticated, service_role;

-- 2. Datos: las piezas En restauración vuelven al estado que tenían al enviarse
-- (Aprobada u Observada) y el historial se reescribe con el nuevo modelo:
--   * cambio de estado X → enviada_taller  ⇒ evento envio_taller (de X a X);
--   * retroceso enviada_taller → X (se deshizo el envío) ⇒ evento vuelta_taller (de X a X);
--   * cualquier otra fila con enviada_taller ⇒ el estado real de la pieza en ese momento
--     (en un retroceso hacia enviada_taller, el estado anterior al paso que deshace).
-- Sin disparadores: no son cambios de negocio (no se encolan trabajos de Shopify, no se
-- audita, no cambia el estado de las restauraciones, que ya estaba al día: una pieza que
-- volvió del taller sigue lista para entregar).
alter table public.pieces disable trigger user;

do $$
declare
  v_piece uuid;
  v_row record;
  v_real public.piece_status;
  v_stack public.piece_status[];
  v_n integer;
  v_event public.piece_event;
  v_from public.piece_status;
  v_to public.piece_status;
begin
  for v_piece in
    select distinct h.piece_id from public.piece_status_history h
    where h.from_status = 'enviada_taller' or h.to_status = 'enviada_taller'
    union
    select p.id from public.pieces p where p.status = 'enviada_taller'
  loop
    v_real := null;
    v_stack := '{}';
    for v_row in
      select h.id, h.event, h.from_status, h.to_status
      from public.piece_status_history h
      where h.piece_id = v_piece
      order by h.occurred_at, h.id
    loop
      v_event := v_row.event;
      v_from := v_row.from_status;
      v_to := v_row.to_status;
      if v_row.event = 'estado' and v_row.to_status = 'enviada_taller' then
        -- El envío ya no es un paso de estado.
        v_event := 'envio_taller';
        v_from := coalesce(nullif(v_row.from_status, 'enviada_taller'), v_real, 'aprobada');
        v_to := v_from;
        v_real := v_from;
      elsif v_row.event = 'retroceso' and v_row.from_status = 'enviada_taller' then
        -- Se deshizo el envío: la pieza volvió del taller, sin cambiar de estado.
        v_event := 'vuelta_taller';
        v_from := coalesce(v_real, nullif(v_row.to_status, 'enviada_taller'), 'aprobada');
        v_to := v_from;
        v_real := v_from;
      elsif v_row.event = 'estado' then
        if v_from = 'enviada_taller' then
          v_from := coalesce(v_real, 'aprobada');
        end if;
        v_stack := array_append(v_stack, v_from);
        v_real := v_to;
      elsif v_row.event = 'retroceso' then
        v_n := cardinality(v_stack);
        if v_to = 'enviada_taller' then
          v_to := coalesce(case when v_n > 0 then v_stack[v_n] end, v_real, 'aprobada');
        end if;
        if v_n > 0 then
          v_stack := v_stack[1:v_n - 1];
        end if;
        v_real := v_to;
      else
        if v_from = 'enviada_taller' then
          v_from := coalesce(v_real, 'aprobada');
        end if;
        if v_to = 'enviada_taller' then
          v_to := coalesce(v_real, 'aprobada');
        end if;
      end if;

      if (v_event, v_from, v_to) is distinct from (v_row.event, v_row.from_status, v_row.to_status) then
        update public.piece_status_history h
        set event = v_event, from_status = v_from, to_status = v_to
        where h.id = v_row.id;
      end if;
    end loop;

    update public.pieces p
    set status = case when v_real in ('aprobada', 'observada') then v_real else 'aprobada' end
    where p.id = v_piece and p.status = 'enviada_taller';
  end loop;
end;
$$;

-- Observadas de hoy: desde su última observación.
update public.pieces p
set observed_at = coalesce(
  (select max(h.occurred_at) from public.piece_status_history h
   where h.piece_id = p.id and h.event = 'estado' and h.to_status = 'observada'),
  p.updated_at
)
where p.status = 'observada';

alter table public.pieces enable trigger user;

alter table public.pieces
  add constraint pieces_status_sin_enviada_taller check (status <> 'enviada_taller');

-- 3. Lista para entregar y ubicación (§7.2) con el nuevo modelo.
alter table public.pieces alter column ready_for_delivery set expression as (
  status in ('aprobada', 'observada')
  and last_sent_at is not null
  and last_returned_at is not null
  and last_returned_at >= last_sent_at
  and (status = 'aprobada' or observed_at is null or last_sent_at > observed_at)
);

alter table public.pieces alter column location set expression as (
  case
    when status = 'anulada' then 'anulada'::public.piece_location
    when status = 'entregada' then 'entregada'::public.piece_location
    when status in ('rechazada', 'sin_arreglo') and returned_at is not null
      then 'entregada'::public.piece_location
    when arrived_at is null then 'por_whatsapp'::public.piece_location
    -- Revisión abierta.
    when review_sent_at is not null
      and (review_returned_at is null or review_returned_at < review_sent_at)
      and status in ('en_consulta', 'en_espera', 'aprobada')
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

drop function public.derive_piece_location(public.piece_status, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz);
create function public.derive_piece_location(
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
      and p_status in ('en_consulta', 'en_espera', 'aprobada')
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

revoke execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.derive_piece_location(public.piece_status, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated, service_role;

-- 4. La vista operativa expone la fecha de la observación (la interfaz sabe si una
-- Observada ya se reenvió al taller).
create or replace view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.urgent, p.workshop_id,
  p.description, p.measure, p.material_id, p.material_name, p.service_id, p.service_name,
  p.weight_grams, p.notes, p.arrived_at, p.approved_at, p.first_sent_at, p.last_sent_at,
  p.last_returned_at, p.ready_for_delivery, p.delivered_at, p.returned_at, p.cancelled_at,
  p.location, p.created_at, p.updated_at, p.review_sent_at, p.review_returned_at, p.material_ids,
  p.observed_at
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 5. Transiciones (P47 sin En restauración). Ir y volver del taller ya no son
-- transiciones. Desde Aprobada: entregar, observar o Sin arreglo cuando ya volvió del
-- taller (lo verifica change_piece_status).
alter table public.piece_status_transitions disable trigger audit_changes;
delete from public.piece_status_transitions
where from_status = 'enviada_taller' or to_status = 'enviada_taller';
insert into public.piece_status_transitions (from_status, to_status, roles, requires_note, requires_workshop) values
  ('aprobada', 'entregada', '{admin,ventas,logistica}', false, false),
  ('aprobada', 'observada', '{admin,ventas,logistica}', true, false),
  ('aprobada', 'sin_arreglo', '{admin,ventas,logistica}', true, false);
alter table public.piece_status_transitions enable trigger audit_changes;

-- 6. Historial: los envíos al taller (por trabajo o por revisión) guardan el taller.
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
    case when p_event in ('envio_taller', 'envio_revision') then p_piece.workshop_id end,
    (select full_name from public.profiles where id = auth.uid()),
    p_event
  );
$$;

-- 7. Cambio de estado sin En restauración:
--   * Aprobada → Entregada / Observada: solo si ya volvió del taller (lista).
--   * Aprobada → Sin arreglo: solo si ya fue al taller.
--   * Observada → Entregada: no mientras está en el taller (reenvío en curso).
--   * Anular una pieza que está en el taller: solo el administrador.
--   * Al entrar a Observada se guarda observed_at.
--   * Revisión abierta: igual que antes, no se cierra la pieza hasta marcar que volvió.
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
    -- Revisión en taller: se cierra solo lo que ya volvió a la tienda.
    if v_review and p_to in ('sin_arreglo', 'anulada', 'rechazada') then
      raise exception 'La pieza % está en el taller por revisión; marca primero que volvió.', v_piece.code
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

-- 8. "Enviar al taller" (admin y logística, como antes Aprobada → En restauración):
-- piezas Aprobadas u Observadas que están en la tienda y no están ya en el taller. Una
-- Aprobada que ya volvió se puede reenviar (arreglo). Si la pieza está en revisión en
-- el mismo taller, la revisión se cierra y sigue ahí por trabajo (mismo viaje).
create function public.send_pieces_to_workshop(p_piece_ids uuid[], p_workshop_id uuid default null)
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role public.app_role := private.current_app_role();
  v_piece public.pieces;
  v_workshop uuid;
  v_review boolean;
  v_count integer := 0;
begin
  if v_role is null or v_role not in ('admin', 'logistica') then
    raise exception 'Tu rol no puede llevar piezas al taller.' using errcode = '42501';
  end if;
  if p_piece_ids is null or cardinality(p_piece_ids) = 0 then
    raise exception 'Elige al menos una pieza' using errcode = '22023';
  end if;
  if p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
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
    if v_piece.status not in ('aprobada', 'observada') then
      raise exception 'La pieza % no está aprobada ni observada.', v_piece.code using errcode = '23514';
    end if;
    -- Al taller solo va lo que está en la tienda (P47).
    if v_piece.arrived_at is null then
      raise exception 'La pieza % aún no llegó a la tienda.', v_piece.code using errcode = '23514';
    end if;
    if private.piece_in_workshop(v_piece.status, v_piece.last_sent_at, v_piece.last_returned_at,
         v_piece.observed_at) then
      raise exception 'La pieza % ya está en el taller.', v_piece.code using errcode = '23514';
    end if;
    v_review := private.review_open(v_piece.review_sent_at, v_piece.review_returned_at);
    if v_review and p_workshop_id is not null and p_workshop_id is distinct from v_piece.workshop_id then
      raise exception 'La pieza % está en revisión en otro taller; marca primero que volvió.', v_piece.code
        using errcode = '23514';
    end if;
    v_workshop := coalesce(p_workshop_id, v_piece.workshop_id);
    if v_workshop is null then
      raise exception 'Elige el taller al que se envía la pieza.' using errcode = '23514';
    end if;

    update public.pieces p set
      workshop_id = v_workshop,
      first_sent_at = coalesce(p.first_sent_at, now()),
      last_sent_at = now(),
      review_returned_at = case when v_review then now() else p.review_returned_at end
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_piece.status, v_piece.status, null, 'envio_taller');

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

revoke execute on function public.send_pieces_to_workshop(uuid[], uuid) from public, anon;
grant execute on function public.send_pieces_to_workshop(uuid[], uuid) to authenticated;

-- 9. "Recibir del taller": Aprobadas u Observadas enviadas y aún sin volver.
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
    if not private.piece_in_workshop(v_piece.status, v_piece.last_sent_at, v_piece.last_returned_at,
         v_piece.observed_at) then
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

-- 10. El taller no se cambia mientras la pieza está en el taller (por trabajo o revisión).
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
        p.status in ('entregada', 'anulada', 'rechazada', 'sin_arreglo')
        or private.review_open(p.review_sent_at, p.review_returned_at)
        or private.piece_in_workshop(p.status, p.last_sent_at, p.last_returned_at, p.observed_at)
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

-- 11. Piezas de un taller: las vivas (ya no hay En restauración).
create or replace function public.list_workshop_pieces(
  p_workshop_id uuid,
  p_limit integer default 20,
  p_offset integer default 0
)
returns table (
  id uuid, restoration_id uuid, restoration_code text, status public.piece_status, code text,
  description text, service_name text, measure text, material_name text, weight_grams numeric,
  service_cost numeric, total_cost numeric, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (select private.has_role('{admin,logistica}')) then
    raise exception 'Tu rol no puede ver las piezas de un taller.' using errcode = '42501';
  end if;
  return query
  select p.id, p.restoration_id, r.code, p.status, p.code, p.description, p.service_name,
    p.measure, p.material_name, p.weight_grams, p.service_cost,
    coalesce(sum(p.service_cost) over (), 0), count(*) over ()
  from public.pieces p
  join public.restorations r on r.id = p.restoration_id
  where p.workshop_id = p_workshop_id
    and p.status in ('registrada', 'en_consulta', 'en_espera', 'aprobada', 'observada')
    and not private.is_past_restoration(r.id, r.status)
  order by r.code, p.number
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
end;
$$;

-- 12. Días en taller: igual a daysInWorkshop(). Un viaje empieza con "Enviar al taller"
-- (envio_taller) o "Llevar a revisar" (envio_revision) y termina con la vuelta
-- (vuelta_taller, vuelta_revision) o con un cambio de estado (o retroceso) que saca la
-- pieza del flujo: Registrada, Entregada, Anulada, Rechazada o Sin arreglo. Enviar al
-- taller desde la revisión continúa el mismo viaje.
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
    if v_entry.event in ('envio_taller', 'envio_revision') then
      v_sent := coalesce(v_sent, v_entry.at);
    elsif v_sent is not null and (
      v_entry.event in ('vuelta_taller', 'vuelta_revision')
      or (v_entry.event in ('estado', 'retroceso')
        and v_entry.to_status in ('registrada', 'entregada', 'anulada', 'rechazada', 'sin_arreglo'))
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

-- 13. Estado anterior para "Retroceder estado": no mientras la pieza está en el taller
-- por trabajo (primero se marca que volvió).
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
    and not private.piece_in_workshop(p.status, p.last_sent_at, p.last_returned_at, p.observed_at)
  order by s.step desc
  limit 1;
$$;

-- 14. Retroceder estado sin En restauración. Las fechas del taller (first_sent_at,
-- last_sent_at) ya no salen de pasos de estado: no se tocan. Al dejar Observada,
-- observed_at queda vacía; al volver a Observada, recupera la fecha del paso que la
-- dejó observada.
create or replace function public.undo_piece_status(p_piece_id uuid, p_note text)
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
  v_observed timestamptz;
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

  -- En el taller por trabajo el estado no se retrocede: primero se marca que volvió.
  if private.piece_in_workshop(v_piece.status, v_piece.last_sent_at, v_piece.last_returned_at,
       v_piece.observed_at) then
    raise exception 'La pieza % está en el taller; marca primero que volvió.', v_piece.code
      using errcode = '23514';
  end if;

  -- Una pieza ya devuelta al cliente no se reactiva.
  if v_from = any (v_closed) and v_piece.returned_at is not null then
    raise exception 'La pieza % ya se devolvió al cliente; no se puede reactivar.', v_piece.code
      using errcode = '23514';
  end if;

  -- Fechas que fijaba el estado que se deja, según los pasos que quedan.
  select max(s.occurred_at) filter (where s.to_status = 'aprobada'),
    max(s.occurred_at) filter (where s.to_status = 'observada'),
    max(s.occurred_at) filter (where s.to_status = 'entregada')
  into v_approved, v_observed, v_delivered
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
    observed_at = case when v_prev = 'observada' then coalesce(v_observed, p.observed_at) else null end,
    delivered_at = case when v_from = 'entregada' then v_delivered else p.delivered_at end,
    cancelled_at = case when v_from = any (v_closed) then null else p.cancelled_at end
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
