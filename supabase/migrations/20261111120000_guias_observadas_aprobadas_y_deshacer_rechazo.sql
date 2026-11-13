-- Guías observadas (pedido del 2026-11-11):
--   1. Nacen Aprobadas: las piezas de una guía observada entran ya aprobadas (además de
--      Observadas), así que el estado general de la guía empieza en "Aprobada" y ya no en
--      "Registrada". Tampoco cambian al pasar una guía a Observada: conservan su fecha de
--      aprobación, o la reciben ahora. No se cobran: la guía sigue sin precio, pagos ni
--      orden de Shopify, y las métricas de ventas solo cuentan guías Normales.
--   2. Una pieza rechazada por el cliente se puede reactivar con "Retroceder estado" aunque
--      ya se le haya devuelto: a veces el cliente cambia de opinión. Al reactivarla se
--      deshace también la devolución (`returned_at`, `returned_by`). La pieza anulada o
--      sin arreglo ya devuelta sigue sin reactivarse. Si todas las piezas de la guía estaban
--      rechazadas, el estado general deja de ser "Rechazada" y se vuelve a calcular.

-- 1. Piezas nuevas de una guía observada: Observada y Aprobada.
create or replace function private.apply_restoration_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.restoration_kind;
begin
  select r.kind into v_kind from public.restorations r where r.id = new.restoration_id;
  if v_kind = 'interno' then
    new.status := 'aprobada';
    new.approved_at := coalesce(new.approved_at, now());
    new.price := null;
  elsif v_kind = 'observado' then
    new.status := 'observada';
    new.approved_at := coalesce(new.approved_at, now());
    new.observed_at := coalesce(new.observed_at, now());
    new.price := null;
    new.service_cost := null;
  end if;
  return new;
end;
$$;

-- Cambiar una guía a Observada: las piezas vivas pasan a Observada y quedan Aprobadas.
create or replace function public.set_restoration_kind(p_restoration_id uuid, p_kind public.restoration_kind)
returns public.restoration_kind
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restoration public.restorations;
  v_piece public.pieces;
  v_from public.piece_status;
  v_next public.restoration_status;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'Tu rol no puede cambiar el tipo de guía.' using errcode = '42501';
  end if;
  if p_kind is null then
    raise exception 'Elige el tipo de guía.' using errcode = '22023';
  end if;

  select * into v_restoration from public.restorations r where r.id = p_restoration_id for update;
  if v_restoration.id is null then
    raise exception 'La restauración no existe' using errcode = '23503';
  end if;
  if v_restoration.kind = p_kind then
    return p_kind;
  end if;
  if v_restoration.shopify_order_id is not null then
    raise exception 'La guía ya tiene orden de Shopify: no se puede cambiar su tipo.' using errcode = '23514';
  end if;
  if exists (select 1 from public.payments pa where pa.restoration_id = p_restoration_id) then
    raise exception 'La guía tiene pagos registrados: no se puede cambiar su tipo.' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pieces p
    where p.restoration_id = p_restoration_id
      and (
        p.first_sent_at is not null
        or p.delivered_at is not null
        or private.review_open(p.review_sent_at, p.review_returned_at)
      )
  ) then
    raise exception 'Solo se cambia el tipo de una guía en la que ninguna pieza fue al taller ni se entregó.'
      using errcode = '23514';
  end if;

  perform set_config('app.restoration_kind_change', 'on', true);

  update public.restorations r set
    kind = p_kind,
    payment_type = case when p_kind = 'normal' then r.payment_type else 'sin_definir' end,
    deposit_percent = case when p_kind = 'normal' then r.deposit_percent end,
    deposit_amount = case when p_kind = 'normal' then r.deposit_amount end
  where r.id = p_restoration_id;

  if p_kind = 'interno' then
    for v_piece in
      select * from public.pieces p
      where p.restoration_id = p_restoration_id
        and p.status in ('registrada', 'en_consulta', 'en_espera')
      order by p.number
      for update
    loop
      v_from := v_piece.status;
      update public.pieces p set status = 'aprobada', approved_at = now()
      where p.id = v_piece.id
      returning * into v_piece;
      perform private.add_status_history(v_piece, v_from, 'aprobada', 'Guía interna');
    end loop;
  elsif p_kind = 'observado' then
    for v_piece in
      select * from public.pieces p
      where p.restoration_id = p_restoration_id
        and p.status in ('registrada', 'en_consulta', 'en_espera', 'aprobada')
      order by p.number
      for update
    loop
      v_from := v_piece.status;
      update public.pieces p set status = 'observada', observed_at = now(), approved_at = coalesce(p.approved_at, now())
      where p.id = v_piece.id
      returning * into v_piece;
      perform private.add_status_history(v_piece, v_from, 'observada', 'Guía observada');
    end loop;
  end if;

  if p_kind <> 'normal' then
    update public.pieces p set
      price = null,
      service_cost = case when p_kind = 'observado' then null else p.service_cost end
    where p.restoration_id = p_restoration_id
      and p.status not in ('anulada', 'rechazada', 'sin_arreglo', 'entregada')
      and (p.price is not null or (p_kind = 'observado' and p.service_cost is not null));
  end if;

  perform set_config('app.restoration_kind_change', '', true);

  -- Nada fue al taller ni se entregó: el estado general es el que dicen las piezas.
  v_next := public.derive_restoration_status(private.restoration_pieces_json(p_restoration_id));
  update public.restorations r set status = v_next
  where r.id = p_restoration_id and r.status is distinct from v_next;

  return p_kind;
end;
$$;

-- 2. Retroceder estado: la pieza rechazada ya devuelta al cliente también se reactiva.
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

  -- Una pieza sin arreglo o anulada ya devuelta al cliente no se reactiva. La rechazada sí:
  -- el cliente puede cambiar de opinión, y al reactivarla se deshace también la devolución.
  if v_from = any (v_closed) and v_from <> 'rechazada' and v_piece.returned_at is not null then
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
    cancelled_at = case when v_from = any (v_closed) then null else p.cancelled_at end,
    returned_at = case when v_from = 'rechazada' then null else p.returned_at end,
    returned_by = case when v_from = 'rechazada' then null else p.returned_by end
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
