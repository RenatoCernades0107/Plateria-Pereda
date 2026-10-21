-- "Deshacer" en el aviso tras mover una pieza en el kanban (pedido del 2026-10-21).
-- Si alguien arrastra una pieza a otra columna por error, el aviso de éxito ofrece
-- "Deshacer" unos segundos: la pieza vuelve EXACTAMENTE a como estaba.
--
-- Diseño:
--   * Foto previa: un disparador AFTER UPDATE en las piezas guarda la fila anterior
--     (OLD) cuando cambia el estado, el taller o una fecha de ubicación. Cuando la misma
--     sentencia escribe el historial (`piece_status_history`), la foto se enlaza a ese
--     evento junto con la fila posterior. Así vale para todas las RPC de movimiento
--     (change_piece_status, send_pieces_to_workshop, receive_from_workshop,
--     send_pieces_for_review, receive_pieces_from_review) sin copiarlas.
--   * Deshacer (`undo_piece_move`) repone las columnas de la foto previa y BORRA los
--     eventos del historial de ese movimiento: no quedan pasos fantasma que cuenten
--     días en el taller ni en la pila de "Retroceder estado". La auditoría (`audit`)
--     registra igual el movimiento y la reposición (son updates de `pieces`).
--     Deshacer "Enviar al taller" no es "Recibir del taller": las fechas vuelven a lo que
--     eran, así que la pieza NO queda "Lista para entregar".
--   * Reglas: solo quien hizo el movimiento, dentro de 2 minutos, si ese evento sigue
--     siendo el último de la pieza y la pieza no cambió después; con los mismos
--     permisos de rol y de guía pasada que el movimiento. No se deshace un movimiento
--     que encoló trabajo para Shopify (crear, editar o preparar la orden) ni si se
--     registró un pago en la guía después: para eso está "Retroceder estado".
--   * El estado general de la guía vuelve al que tenía antes del movimiento si nada más
--     pasó en la guía después; si no, se recalcula solo si estaba al día con sus piezas
--     (como undo_piece_status).
--   * Las fotos de más de un día se borran solas.

-- 1. Fotos de las piezas antes (y después) de cada movimiento.
create table private.piece_move_snapshots (
  id bigint generated always as identity primary key,
  piece_id uuid not null references public.pieces (id) on delete cascade,
  -- Evento del historial del movimiento (null mientras la sentencia no lo escribe).
  history_id bigint unique references public.piece_status_history (id) on delete cascade,
  -- Sentencia que hizo el cambio (transacción + inicio de la sentencia).
  txid bigint not null,
  stmt_at timestamptz not null,
  -- Fila de la pieza antes y después del movimiento.
  before jsonb not null,
  after jsonb,
  -- Estado general de la guía antes del movimiento.
  restoration_status public.restoration_status,
  -- Último trabajo de Shopify antes del movimiento (los posteriores los encoló él o
  -- algo que pasó después).
  last_job_id bigint not null default 0,
  created_at timestamptz not null default now()
);

comment on table private.piece_move_snapshots is
  'Foto de la pieza antes de cada movimiento, para "Deshacer" en el kanban. Se borra al día.';

create index piece_move_snapshots_pending_idx
  on private.piece_move_snapshots (piece_id, txid, stmt_at) where history_id is null;
create index piece_move_snapshots_created_idx on private.piece_move_snapshots (created_at);

revoke all on private.piece_move_snapshots from public, anon, authenticated;

-- 2. Al cambiar la ubicación o el estado: foto de la fila anterior (una por sentencia).
create or replace function private.capture_piece_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx bigint := txid_current();
  v_stmt timestamptz := statement_timestamp();
begin
  -- La reposición de "Deshacer" no es un movimiento.
  if coalesce(current_setting('app.undo_piece_move', true), '') = 'on' then
    return null;
  end if;
  -- Ya hay foto de esta sentencia: vale la primera (el estado de antes del movimiento).
  if exists (
    select 1 from private.piece_move_snapshots s
    where s.piece_id = new.id and s.history_id is null and s.txid = v_tx and s.stmt_at = v_stmt
  ) then
    return null;
  end if;
  -- Fotos de cambios sin evento del historial (p. ej. asignar el taller): ya no sirven.
  delete from private.piece_move_snapshots s
  where s.piece_id = new.id and s.history_id is null;

  insert into private.piece_move_snapshots
    (piece_id, txid, stmt_at, before, restoration_status, last_job_id)
  values (
    new.id, v_tx, v_stmt, to_jsonb(old),
    (select r.status from public.restorations r where r.id = new.restoration_id),
    coalesce((select max(j.id) from public.shopify_sync_jobs j), 0)
  );
  return null;
end;
$$;

revoke execute on function private.capture_piece_move() from public, anon, authenticated;

-- Primero entre los AFTER (orden alfabético): la guía aún tiene su estado anterior y
-- aún no se encolaron los trabajos de Shopify de este cambio.
create trigger pieces_capture_move
  after update of status, workshop_id, approved_at, observed_at, delivered_at, cancelled_at,
    first_sent_at, last_sent_at, last_returned_at, review_sent_at, review_returned_at,
    arrived_at, returned_at, returned_by
  on public.pieces
  for each row
  when ((old.status, old.workshop_id, old.approved_at, old.observed_at, old.delivered_at,
         old.cancelled_at, old.first_sent_at, old.last_sent_at, old.last_returned_at,
         old.review_sent_at, old.review_returned_at, old.arrived_at, old.returned_at,
         old.returned_by)
    is distinct from
        (new.status, new.workshop_id, new.approved_at, new.observed_at, new.delivered_at,
         new.cancelled_at, new.first_sent_at, new.last_sent_at, new.last_returned_at,
         new.review_sent_at, new.review_returned_at, new.arrived_at, new.returned_at,
         new.returned_by))
  execute function private.capture_piece_move();

-- 3. Al escribir el evento del historial: se enlaza la foto de la misma sentencia y se
-- guarda la fila posterior. De paso se borran las fotos viejas.
create or replace function private.link_piece_move()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.piece_move_snapshots s set
    history_id = new.id,
    after = (select to_jsonb(p) from public.pieces p where p.id = new.piece_id)
  where s.piece_id = new.piece_id
    and s.history_id is null
    and s.txid = txid_current()
    and s.stmt_at = statement_timestamp();

  delete from private.piece_move_snapshots s where s.created_at < now() - interval '1 day';
  return null;
end;
$$;

revoke execute on function private.link_piece_move() from public, anon, authenticated;

create trigger piece_status_history_link_move
  after insert on public.piece_status_history
  for each row execute function private.link_piece_move();

-- 4. ¿Se puede deshacer este movimiento? Devuelve el motivo (y su código) si no.
create or replace function private.piece_move_undo_error(p_history_id bigint)
returns table (code text, message text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_role public.app_role := private.current_app_role();
  v_h public.piece_status_history;
  v_snap private.piece_move_snapshots;
  v_piece public.pieces;
  v_after public.pieces;
  v_restoration public.restorations;
  v_rule public.piece_status_transitions;
begin
  if v_role is null then
    code := '42501'; message := 'Inicia sesión para deshacer el movimiento.';
    return next; return;
  end if;
  select * into v_h from public.piece_status_history h where h.id = p_history_id;
  select * into v_snap from private.piece_move_snapshots s where s.history_id = p_history_id;
  if v_h.id is null or v_snap.id is null or v_snap.after is null
     or v_h.event not in ('estado', 'envio_taller', 'vuelta_taller', 'envio_revision', 'vuelta_revision') then
    code := '23514'; message := 'Este movimiento ya no se puede deshacer.';
    return next; return;
  end if;
  select * into v_piece from public.pieces p where p.id = v_h.piece_id;
  if v_h.actor_id is distinct from auth.uid() then
    code := '42501'; message := 'Solo quien movió la pieza puede deshacer el movimiento.';
    return next; return;
  end if;
  if v_h.occurred_at < now() - interval '2 minutes' then
    code := '23514';
    message := format('Ya pasó el tiempo para deshacer el movimiento de la pieza %s.', v_piece.code);
    return next; return;
  end if;

  -- Nada pasó después: el evento es el último de la pieza y la pieza sigue igual.
  v_after := jsonb_populate_record(null::public.pieces, v_snap.after);
  if exists (
    select 1 from public.piece_status_history h
    where h.piece_id = v_h.piece_id
      and (h.occurred_at > v_h.occurred_at or (h.occurred_at = v_h.occurred_at and h.id > v_h.id))
  ) or (v_piece.status, v_piece.workshop_id, v_piece.approved_at, v_piece.observed_at,
        v_piece.delivered_at, v_piece.cancelled_at, v_piece.first_sent_at, v_piece.last_sent_at,
        v_piece.last_returned_at, v_piece.review_sent_at, v_piece.review_returned_at,
        v_piece.arrived_at, v_piece.returned_at, v_piece.returned_by)
    is distinct from
       (v_after.status, v_after.workshop_id, v_after.approved_at, v_after.observed_at,
        v_after.delivered_at, v_after.cancelled_at, v_after.first_sent_at, v_after.last_sent_at,
        v_after.last_returned_at, v_after.review_sent_at, v_after.review_returned_at,
        v_after.arrived_at, v_after.returned_at, v_after.returned_by) then
    code := '23514';
    message := format('La pieza %s cambió después del movimiento; ya no se puede deshacer.', v_piece.code);
    return next; return;
  end if;

  -- Ni Shopify ni pagos: eso se corrige con "Retroceder estado" o desde los pagos.
  if exists (
    select 1 from public.shopify_sync_jobs j
    where j.entity_table = 'restorations' and j.entity_id = v_h.restoration_id::text
      and j.id > v_snap.last_job_id
  ) then
    code := '23514';
    message := format('El movimiento de la pieza %s ya cambió la orden de Shopify; usa «Retroceder estado».',
      v_piece.code);
    return next; return;
  end if;
  if exists (
    select 1 from public.payments pay
    where pay.restoration_id = v_h.restoration_id and pay.created_at >= v_h.occurred_at
  ) then
    code := '23514';
    message := format('Se registró un pago en la guía de la pieza %s; ya no se puede deshacer.', v_piece.code);
    return next; return;
  end if;

  -- Los mismos permisos que el movimiento.
  if v_h.event = 'estado' then
    select * into v_rule from public.piece_status_transitions t
    where t.from_status = v_h.from_status and t.to_status = v_h.to_status;
    if v_rule.from_status is null or not (v_role = any (v_rule.roles)) then
      code := '42501'; message := 'Tu rol no puede deshacer este cambio de estado.';
      return next; return;
    end if;
  elsif v_role not in ('admin', 'logistica') then
    code := '42501'; message := 'Tu rol no puede deshacer este movimiento.';
    return next; return;
  end if;
  select * into v_restoration from public.restorations r where r.id = v_h.restoration_id;
  if v_role = 'logistica'
     and private.is_past_restoration(v_restoration.id, coalesce(v_snap.restoration_status, v_restoration.status)) then
    code := '42501'; message := 'Tu rol no puede deshacer este movimiento.';
    return next; return;
  end if;
end;
$$;

revoke execute on function private.piece_move_undo_error(bigint) from public, anon, authenticated;

-- 5. Para la interfaz, justo después de mover: los eventos que "Deshacer" revertiría
-- (el último de cada pieza). Vacío si alguna pieza no se puede deshacer: el
-- movimiento se deshace entero o no se ofrece.
create or replace function public.piece_move_undo_ids(p_piece_ids uuid[])
returns bigint[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ids bigint[] := '{}';
  v_piece uuid;
  v_id bigint;
begin
  if p_piece_ids is null or cardinality(p_piece_ids) = 0 then
    return v_ids;
  end if;
  foreach v_piece in array (select array_agg(distinct x) from unnest(p_piece_ids) x) loop
    v_id := null;
    select h.id into v_id from public.piece_status_history h
    where h.piece_id = v_piece
    order by h.occurred_at desc, h.id desc
    limit 1;
    if v_id is null or exists (select 1 from private.piece_move_undo_error(v_id)) then
      return '{}';
    end if;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end;
$$;

revoke execute on function public.piece_move_undo_ids(uuid[]) from public, anon;
grant execute on function public.piece_move_undo_ids(uuid[]) to authenticated;

-- 6. Deshacer el movimiento (una o varias piezas a la vez, todo o nada).
create or replace function public.undo_piece_move(p_history_ids bigint[])
returns table (piece_id uuid, status public.piece_status)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ids bigint[];
  v_id bigint;
  v_err record;
  v_row record;
  v_before public.pieces;
  v_piece public.pieces;
  v_restoration record;
  v_restorations jsonb := '{}';
  v_entry jsonb;
  v_next public.restoration_status;
begin
  if private.current_app_role() is null then
    raise exception 'Inicia sesión para deshacer el movimiento.' using errcode = '42501';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_history_ids) x where x is not null;
  if v_ids is null then
    raise exception 'Elige el movimiento que quieres deshacer.' using errcode = '22023';
  end if;

  -- Bloqueo de las piezas (en orden, como las demás RPC) antes de validar.
  perform 1 from public.pieces p
  where p.id in (select h.piece_id from public.piece_status_history h where h.id = any (v_ids))
  order by p.id
  for update;
  if (select count(distinct h.piece_id) from public.piece_status_history h where h.id = any (v_ids))
     <> cardinality(v_ids) then
    raise exception 'Este movimiento ya no se puede deshacer.' using errcode = '23514';
  end if;

  foreach v_id in array v_ids loop
    select * into v_err from private.piece_move_undo_error(v_id) limit 1;
    if v_err.code is not null then
      raise exception '%', v_err.message using errcode = v_err.code;
    end if;
  end loop;

  -- Guías afectadas: el estado que tenían antes del movimiento (la foto más antigua de
  -- cada una), el primer evento del movimiento y si estaban al día con sus piezas.
  for v_restoration in
    select h.restoration_id,
      (array_agg(s.restoration_status order by s.id))[1] as prev_status,
      min(h.id) as first_history_id
    from public.piece_status_history h
    join private.piece_move_snapshots s on s.history_id = h.id
    where h.id = any (v_ids)
    group by h.restoration_id
  loop
    perform 1 from public.restorations r where r.id = v_restoration.restoration_id for update;
    v_restorations := v_restorations || jsonb_build_object(
      v_restoration.restoration_id::text,
      jsonb_build_object(
        'prev', v_restoration.prev_status,
        'first', v_restoration.first_history_id,
        'in_sync', (select r.status = public.derive_restoration_status(
                      private.restoration_pieces_json(r.id))
                    from public.restorations r where r.id = v_restoration.restoration_id)
      )
    );
  end loop;

  -- Reponer las piezas. La reposición no saca foto ni pide saldo (si volviera a
  -- Entregada, ya se había entregado).
  perform set_config('app.undo_piece_move', 'on', true);
  perform set_config('app.deliver_with_balance', 'on', true);
  for v_row in
    select h.id, h.piece_id, s.before
    from public.piece_status_history h
    join private.piece_move_snapshots s on s.history_id = h.id
    where h.id = any (v_ids)
    order by h.piece_id
  loop
    v_before := jsonb_populate_record(null::public.pieces, v_row.before);
    update public.pieces p set
      status = v_before.status,
      workshop_id = v_before.workshop_id,
      approved_at = v_before.approved_at,
      observed_at = v_before.observed_at,
      delivered_at = v_before.delivered_at,
      cancelled_at = v_before.cancelled_at,
      first_sent_at = v_before.first_sent_at,
      last_sent_at = v_before.last_sent_at,
      last_returned_at = v_before.last_returned_at,
      review_sent_at = v_before.review_sent_at,
      review_returned_at = v_before.review_returned_at,
      arrived_at = v_before.arrived_at,
      returned_at = v_before.returned_at,
      returned_by = v_before.returned_by
    where p.id = v_row.piece_id
    returning * into v_piece;

    piece_id := v_piece.id;
    status := v_piece.status;
    return next;
  end loop;
  perform set_config('app.deliver_with_balance', '', true);
  perform set_config('app.undo_piece_move', '', true);

  -- Sin pasos fantasma: los eventos del movimiento se borran (y con ellos sus fotos).
  delete from public.piece_status_history h where h.id = any (v_ids);

  -- Estado general: el de antes si nada más pasó en la guía; si no, se recalcula solo
  -- si estaba al día con sus piezas (como "Retroceder estado").
  for v_entry in select value || jsonb_build_object('id', key) from jsonb_each(v_restorations) loop
    if not exists (
      select 1 from public.piece_status_history h
      where h.restoration_id = (v_entry ->> 'id')::uuid
        and h.id > (v_entry ->> 'first')::bigint
    ) and v_entry ->> 'prev' is not null then
      v_next := (v_entry ->> 'prev')::public.restoration_status;
    elsif (v_entry ->> 'in_sync')::boolean then
      v_next := public.derive_restoration_status(
        private.restoration_pieces_json((v_entry ->> 'id')::uuid)
      );
    else
      continue;
    end if;
    update public.restorations r set status = v_next
    where r.id = (v_entry ->> 'id')::uuid and r.status is distinct from v_next;
  end loop;
end;
$$;

revoke execute on function public.undo_piece_move(bigint[]) from public, anon;
grant execute on function public.undo_piece_move(bigint[]) to authenticated;
