-- Estados de las piezas en la BD (Paso 8.3): transiciones, historial, RPC de cambio de
-- estado y de llegada a tienda, estado general de la restauración, encolado de la
-- orden de Shopify y métricas de días. Replica src/domain/piece-state-machine.ts,
-- restoration-status.ts y piece-days.ts; tests de integración verifican que coincidan.

-- 1. Transiciones (fuente de verdad en la BD; sembrada con PIECE_TRANSITIONS).
create table public.piece_status_transitions (
  from_status public.piece_status not null,
  to_status public.piece_status not null,
  roles public.app_role[] not null check (cardinality(roles) > 0),
  requires_note boolean not null default false,
  requires_workshop boolean not null default false,
  primary key (from_status, to_status)
);

comment on table public.piece_status_transitions is
  'Transiciones de estado de la pieza (§7.1). Idéntica a PIECE_TRANSITIONS de TypeScript.';

insert into public.piece_status_transitions (from_status, to_status, roles, requires_note, requires_workshop) values
  ('registrada', 'en_consulta', '{admin,ventas}', true, false),
  ('registrada', 'aprobada', '{admin,ventas}', false, false),
  ('en_consulta', 'en_espera', '{admin,ventas}', false, false),
  ('en_espera', 'aprobada', '{admin,ventas}', false, false),
  ('aprobada', 'recibida', '{admin,ventas,logistica}', false, false),
  ('recibida', 'enviada_taller', '{admin,logistica}', false, true),
  ('enviada_taller', 'devuelta_taller', '{admin,logistica}', false, false),
  ('devuelta_taller', 'entregada', '{admin,ventas,logistica}', false, false),
  ('devuelta_taller', 'observada', '{admin,ventas,logistica}', true, false),
  ('observada', 'enviada_taller', '{admin,logistica}', false, true),
  ('entregada', 'observada', '{admin,ventas,logistica}', true, false),
  ('registrada', 'anulada', '{admin,ventas}', true, false),
  ('en_consulta', 'anulada', '{admin,ventas}', true, false),
  ('en_espera', 'anulada', '{admin,ventas}', true, false),
  ('aprobada', 'anulada', '{admin,ventas}', true, false),
  ('recibida', 'anulada', '{admin,ventas}', true, false),
  -- P41 (d): una pieza que está en el taller solo la anula el administrador.
  ('enviada_taller', 'anulada', '{admin}', true, false),
  ('devuelta_taller', 'anulada', '{admin,ventas}', true, false),
  ('observada', 'anulada', '{admin,ventas}', true, false);

revoke all on public.piece_status_transitions from anon, authenticated;
grant select on public.piece_status_transitions to authenticated;
alter table public.piece_status_transitions enable row level security;
create policy "Los usuarios leen las transiciones"
  on public.piece_status_transitions for select to authenticated
  using ((select private.current_app_role()) is not null);
select audit.enable('public.piece_status_transitions');

-- 2. Historial de estados. Solo lo escriben los triggers y RPC de este archivo.
create table public.piece_status_history (
  id bigint generated always as identity primary key,
  piece_id uuid not null references public.pieces (id) on delete cascade,
  restoration_id uuid not null references public.restorations (id) on delete cascade,
  from_status public.piece_status,
  to_status public.piece_status not null,
  note text check (length(note) <= 1000),
  workshop_id uuid references public.workshops (id) on delete set null,
  actor_id uuid default auth.uid(),
  actor_name text,
  occurred_at timestamptz not null default now()
);

comment on table public.piece_status_history is
  'Cada cambio de estado de una pieza (quién, cuándo, nota). Logística no lo lee (P42).';

create index piece_status_history_piece_idx on public.piece_status_history (piece_id, occurred_at, id);
create index piece_status_history_restoration_idx on public.piece_status_history (restoration_id);

revoke all on public.piece_status_history from anon, authenticated;
grant select on public.piece_status_history to authenticated;
alter table public.piece_status_history enable row level security;
create policy "Admin y ventas leen el historial de estados"
  on public.piece_status_history for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

create or replace function private.add_status_history(
  p_piece public.pieces,
  p_from public.piece_status,
  p_to public.piece_status,
  p_note text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.piece_status_history
    (piece_id, restoration_id, from_status, to_status, note, workshop_id, actor_name)
  values (
    p_piece.id, p_piece.restoration_id, p_from, p_to, nullif(trim(p_note), ''),
    case when p_to = 'enviada_taller' then p_piece.workshop_id end,
    (select full_name from public.profiles where id = auth.uid())
  );
$$;

revoke execute on function private.add_status_history(public.pieces, public.piece_status, public.piece_status, text)
  from public, anon, authenticated;

-- Paso inicial del historial al registrar la pieza (completa el historial de 7.3).
create or replace function private.log_piece_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.add_status_history(new, null, new.status, null);
  return null;
end;
$$;

revoke execute on function private.log_piece_created() from public, anon, authenticated;

create trigger pieces_log_created
  after insert on public.pieces
  for each row execute function private.log_piece_created();

-- 3. Cambio de estado de una o varias piezas (acciones masivas).
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
    -- Aprobada → Recibida es "Marcar llegada a tienda" (mark_pieces_arrived).
    if v_rule is null or (v_piece.status = 'aprobada' and p_to = 'recibida') then
      raise exception 'La pieza % no puede pasar a ese estado.', v_piece.code using errcode = '23514';
    end if;
    if not (v_role = any (v_rule.roles)) then
      raise exception 'Tu rol no puede hacer este cambio de estado.' using errcode = '42501';
    end if;
    if v_rule.requires_note and v_note is null then
      raise exception 'Escribe una nota para este cambio de estado.' using errcode = '23514';
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
      last_returned_at = case when p_to = 'devuelta_taller' then now() else p.last_returned_at end,
      delivered_at = case when p_to = 'entregada' then now() else p.delivered_at end,
      cancelled_at = case when p_to = 'anulada' then now() else p.cancelled_at end
    where p.id = v_piece.id
    returning * into v_piece;
    perform private.add_status_history(v_piece, v_from, p_to, v_note);

    -- Llegada anticipada: aprobar una pieza que ya está en tienda la deja Recibida.
    if p_to = 'aprobada' and v_piece.arrived_at is not null then
      update public.pieces p set status = 'recibida', received_at = now()
      where p.id = v_piece.id
      returning * into v_piece;
      perform private.add_status_history(v_piece, 'aprobada', 'recibida', null);
    end if;

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

-- 4. Llegada física a la tienda (todos los roles). Aprobada → Recibida; en los
-- estados anteriores solo guarda la fecha.
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
    if v_piece.arrived_at is not null
       or v_piece.status not in ('registrada', 'en_consulta', 'en_espera', 'aprobada') then
      raise exception 'La pieza % ya está en tienda o no espera llegar.', v_piece.code
        using errcode = '23514';
    end if;
    if v_piece.status = 'aprobada' then
      update public.pieces p set status = 'recibida', arrived_at = now(), received_at = now()
      where p.id = v_piece.id
      returning * into v_piece;
      perform private.add_status_history(v_piece, 'aprobada', 'recibida', null);
    else
      update public.pieces p set arrived_at = now()
      where p.id = v_piece.id
      returning * into v_piece;
    end if;
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

-- 5. Derivados, iguales a restoration-status.ts (los verifica el fixture compartido).
create or replace function public.derive_piece_location(
  p_status public.piece_status,
  p_arrived_at timestamptz
)
returns public.piece_location
language sql
immutable
set search_path = ''
as $$
  select case
    when p_status = 'anulada' then 'anulada'::public.piece_location
    when p_status = 'entregada' then 'entregada'::public.piece_location
    when p_status = 'enviada_taller' then 'en_taller'::public.piece_location
    when p_arrived_at is not null then 'en_tienda'::public.piece_location
    else 'por_recibir'::public.piece_location
  end;
$$;

-- p_pieces: [{ "status", "approvedAt", "firstSentAt" }, …]
create or replace function public.derive_restoration_status(p_pieces jsonb)
returns public.restoration_status
language sql
immutable
set search_path = ''
as $$
  with p as (
    select (e ->> 'status')::public.piece_status as status,
      (e ->> 'approvedAt') is not null as approved,
      (e ->> 'firstSentAt') is not null as sent
    from jsonb_array_elements(coalesce(p_pieces, '[]')) e
  ),
  a as (select * from p where status <> 'anulada')
  select case
    when not exists (select 1 from a) then
      case when exists (select 1 from p) then 'anulada' else 'registrada' end
    when (select bool_and(status = 'entregada') from a) then 'completada'
    when (select bool_and(status in ('devuelta_taller', 'entregada')) from a) then 'lista'
    when (select bool_or(status in ('devuelta_taller', 'entregada')) from a) then 'parcialmente_lista'
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
  where e ->> 'status' <> 'anulada';
$$;

-- Días calendario en Lima entre dos instantes (nunca negativo).
create or replace function public.lima_days_between(p_start timestamptz, p_end timestamptz)
returns integer
language sql
immutable
set search_path = ''
as $$
  select greatest(0, (p_end at time zone 'America/Lima')::date - (p_start at time zone 'America/Lima')::date);
$$;

-- p_history: [{ "from", "to", "at" }, …]. Igual a daysInWorkshop().
create or replace function public.workshop_days(p_history jsonb, p_now timestamptz)
returns table (days integer, ongoing boolean)
language sql
stable
set search_path = ''
as $$
  with h as (
    select e ->> 'to' as to_status, (e ->> 'at')::timestamptz as at,
      row_number() over (order by (e ->> 'at')::timestamptz, ord) as rn
    from jsonb_array_elements(coalesce(p_history, '[]')) with ordinality as x(e, ord)
  ),
  trips as (
    -- Cada llegada a "enviada_taller" hasta la siguiente salida de ese estado, o
    -- hasta ahora si la pieza sigue en el taller.
    select s.at as sent_at,
      (select b.at from h b
       where b.rn > s.rn and b.to_status <> 'enviada_taller'
       order by b.rn limit 1) as back_at
    from h s
    where s.to_status = 'enviada_taller'
      and not exists (select 1 from h p where p.rn = s.rn - 1 and p.to_status = 'enviada_taller')
  )
  select coalesce(sum(public.lima_days_between(sent_at, coalesce(back_at, p_now))), 0)::integer,
    coalesce(bool_or(back_at is null), false)
  from trips;
$$;

-- Igual a fulfillmentDays(): null si la pieza está anulada.
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
  where p_status not in ('anulada') and not (p_status = 'entregada' and p_delivered_at is not null);
$$;

revoke execute on function public.derive_restoration_status(jsonb) from public, anon;
revoke execute on function public.is_ready_for_shopify_order(jsonb) from public, anon;
revoke execute on function public.workshop_days(jsonb, timestamptz) from public, anon;
revoke execute on function public.fulfillment_days(public.piece_status, timestamptz, timestamptz, timestamptz) from public, anon;
revoke execute on function public.derive_piece_location(public.piece_status, timestamptz) from public, anon;
revoke execute on function public.lima_days_between(timestamptz, timestamptz) from public, anon;
grant execute on function public.derive_restoration_status(jsonb) to authenticated, service_role;
grant execute on function public.is_ready_for_shopify_order(jsonb) to authenticated, service_role;
grant execute on function public.workshop_days(jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.fulfillment_days(public.piece_status, timestamptz, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.derive_piece_location(public.piece_status, timestamptz) to authenticated, service_role;
grant execute on function public.lima_days_between(timestamptz, timestamptz) to authenticated, service_role;

-- 6. Estado general y orden de Shopify: se recalculan cuando cambian las piezas.
create or replace function private.sync_restoration_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pieces jsonb;
  v_restoration public.restorations;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
      'status', p.status, 'approvedAt', p.approved_at, 'firstSentAt', p.first_sent_at)), '[]')
  into v_pieces
  from public.pieces p where p.restoration_id = new.restoration_id;

  update public.restorations r
  set status = public.derive_restoration_status(v_pieces)
  where r.id = new.restoration_id
    and r.status is distinct from public.derive_restoration_status(v_pieces)
  returning * into v_restoration;
  if v_restoration.id is null then
    select * into v_restoration from public.restorations where id = new.restoration_id;
  end if;

  -- Todas las piezas no anuladas aprobadas y sin orden: se encola su creación una
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

revoke execute on function private.sync_restoration_status() from public, anon, authenticated;

create trigger pieces_sync_restoration_status
  after insert or update of status, approved_at, first_sent_at on public.pieces
  for each row execute function private.sync_restoration_status();

-- 7. Métricas por pieza (días en taller y de cumplimiento). Corre con los permisos
-- de quien consulta (security_invoker): logística no la ve, como el historial (P42);
-- la página le muestra los días en taller con get_piece_workshop_days().
create view public.piece_metrics
with (security_invoker = true)
as
select p.id as piece_id, p.restoration_id, p.code, p.status,
  w.days as workshop_days, w.ongoing as workshop_ongoing,
  f.days as fulfillment_days, f.ongoing as fulfillment_ongoing
from public.pieces p
cross join lateral public.workshop_days((
  select coalesce(jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'at', h.occurred_at)
    order by h.occurred_at, h.id), '[]')
  from public.piece_status_history h where h.piece_id = p.id
), now()) w
left join lateral public.fulfillment_days(p.status, p.created_at, p.delivered_at, now()) f on true;

revoke all on public.piece_metrics from anon, authenticated;
grant select on public.piece_metrics to authenticated;

-- Para logística: días en taller y la última observación de las piezas que ve
-- (sin el resto del historial, P42).
create or replace function public.piece_logistics_info(p_restoration_id uuid)
returns table (piece_id uuid, workshop_days integer, workshop_ongoing boolean, last_observation text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, w.days, w.ongoing,
    (select h.note from public.piece_status_history h
     where h.piece_id = p.id and h.to_status = 'observada'
     order by h.occurred_at desc, h.id desc limit 1)
  from public.pieces_operational p
  cross join lateral public.workshop_days((
    select coalesce(jsonb_agg(jsonb_build_object('from', h.from_status, 'to', h.to_status, 'at', h.occurred_at)
      order by h.occurred_at, h.id), '[]')
    from public.piece_status_history h where h.piece_id = p.id
  ), now()) w
  where p.restoration_id = p_restoration_id;
$$;

revoke execute on function public.piece_logistics_info(uuid) from public, anon;
grant execute on function public.piece_logistics_info(uuid) to authenticated;
