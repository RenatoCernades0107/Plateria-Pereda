-- Tipo de guía (pedido del 2026-10-17, punto 8). Además de la guía normal (se cotiza,
-- se cobra y crea su orden en Shopify) hay dos guías que no se cobran:
--   * Interna: piezas de la tienda que se mandan a arreglar. Las piezas nacen Aprobadas
--     (no pasan por Consulta aunque no tengan precio), sin precio de venta.
--   * Observada: piezas que vuelven por un reclamo. Nacen Observadas, sin precio de
--     venta ni costo de servicio. Su estado general queda Registrada (ninguna aprobada).
-- En ambas: sin pagos ni adelanto (tipo de pago "Sin definir") y sin orden de Shopify.
-- El tipo se puede cambiar mientras nada se cobró ni fue al taller (set_restoration_kind).

-- 1. Tipo y columna.
create type public.restoration_kind as enum ('normal', 'interno', 'observado');

alter table public.restorations
  add column kind public.restoration_kind not null default 'normal';
comment on column public.restorations.kind is
  'Tipo de guía: normal, interno (piezas de la tienda) u observado (reclamo). Las dos últimas no se cobran.';

-- Se elige al registrar (create_restoration); después solo con set_restoration_kind.
grant insert (kind) on public.restorations to authenticated;

-- Sin cobro: tipo de pago "Sin definir" y sin adelanto.
alter table public.restorations
  add constraint restorations_kind_sin_cobro check (
    kind = 'normal'
    or (payment_type = 'sin_definir' and deposit_percent is null and deposit_amount is null)
  );

create or replace view public.restorations_operational
with (security_barrier = true)
as
select r.id, r.code, r.client_id, r.contact_id, r.status, r.payment_type, r.notes,
  r.shopify_order_name, r.created_by, r.created_at, r.updated_at, r.origin, r.whatsapp_quote_id,
  r.kind
from public.restorations r
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or not private.is_past_restoration(r.id, r.status)
  );

-- 2. El tipo solo cambia con set_restoration_kind (revisa que se pueda y ajusta las
-- piezas). La clave secreta y el mantenimiento no pasan por aquí.
create or replace function private.guard_restoration_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind
     and coalesce(current_setting('app.restoration_kind_change', true), '') <> 'on'
     and coalesce(current_setting('role', true), '') = 'authenticated' then
    raise exception 'El tipo de guía se cambia con "Cambiar tipo de guía".' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_restoration_kind() from public, anon, authenticated;

create trigger restorations_guard_kind
  before update of kind on public.restorations
  for each row execute function private.guard_restoration_kind();

-- 3. Piezas nuevas según el tipo de la guía (al registrar y al agregar una pieza).
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
    new.observed_at := coalesce(new.observed_at, now());
    new.price := null;
    new.service_cost := null;
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_restoration_kind() from public, anon, authenticated;

-- Antes que los demás BEFORE INSERT (orden alfabético): el precio ya va vacío al guard.
create trigger pieces_apply_kind
  before insert on public.pieces
  for each row execute function private.apply_restoration_kind();

-- 4. Guías que no se cobran: sin precio de venta (y la observada, sin costo de servicio).
create or replace function private.guard_piece_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind public.restoration_kind;
begin
  select r.kind into v_kind from public.restorations r where r.id = new.restoration_id;
  if v_kind <> 'normal' and new.price is not null and new.price is distinct from old.price then
    raise exception 'Una guía interna u observada no lleva precio de venta.' using errcode = '23514';
  end if;
  if v_kind = 'observado' and new.service_cost is not null
     and new.service_cost is distinct from old.service_cost then
    raise exception 'Una guía observada no lleva costo de servicio.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_piece_kind() from public, anon, authenticated;

create trigger pieces_guard_kind
  before update of price, service_cost on public.pieces
  for each row execute function private.guard_piece_kind();

-- El cambio de tipo vacía los precios aunque lo haga ventas.
create or replace function private.guard_piece_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' and new.price is null)
     or (tg_op = 'UPDATE' and new.price is not distinct from old.price) then
    return new;
  end if;
  -- Copia del precio cotizado por WhatsApp, cambio de precio con la orden creada y
  -- precios vaciados al cambiar el tipo de guía.
  if coalesce(current_setting('app.quote_copy_price', true), '') = 'on'
     or coalesce(current_setting('app.shopify_order_edit', true), '') = 'on'
     or (new.price is null and coalesce(current_setting('app.restoration_kind_change', true), '') = 'on') then
    return new;
  end if;
  -- Se exige en las peticiones de usuarios (rol `authenticated`, también dentro de
  -- funciones security definer). La clave secreta y el mantenimiento no pasan por aquí.
  -- (Dos IF: la clave secreta no puede ejecutar private.has_role.)
  if coalesce(current_setting('role', true), '') <> 'authenticated' then
    return new;
  end if;
  if not private.has_role('{admin}') then
    raise exception 'Solo el administrador asigna el precio de venta.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- 5. Sin pagos en guías internas u observadas.
create or replace function private.guard_payment_kind()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.restorations r where r.id = new.restoration_id and r.kind <> 'normal'
  ) then
    raise exception 'Una guía interna u observada no recibe pagos.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.guard_payment_kind() from public, anon, authenticated;

create trigger payments_guard_kind
  before insert on public.payments
  for each row execute function private.guard_payment_kind();

-- 6. Sin orden de Shopify en guías que no se cobran.
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
      'readyForDelivery', p.ready_for_delivery, 'price', p.price)), '[]')
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

  -- Todas las piezas que se cobran aprobadas y con precio, y sin orden: se encola su
  -- creación una sola vez (un job con error se reintenta desde "Reintentar", no se
  -- duplica). Un job que se omitió porque la restauración dejó de estar lista (se
  -- agregó una pieza antes de procesarlo) no cuenta: se vuelve a encolar. Las guías
  -- internas u observadas no se cobran: nunca tienen orden.
  if v_restoration.shopify_order_id is null
     and v_restoration.kind = 'normal'
     and public.is_ready_for_shopify_order(v_pieces)
     and not exists (
       select 1 from public.shopify_sync_jobs j
       where j.kind = 'order.create' and j.entity_table = 'restorations'
         and j.entity_id = v_restoration.id::text
         and not (j.status = 'ok' and coalesce(j.result ->> 'skipped', '') = 'true')
     ) then
    perform private.enqueue_shopify_job(
      'order.create', 'restorations', v_restoration.id::text, '{}', 'order:' || v_restoration.id
    );
  end if;
  return null;
end;
$$;

-- 7. Registrar una restauración con su tipo y la cantidad de cada pieza. En una guía
-- interna u observada se ignoran el precio, el tipo de pago y el adelanto, y las piezas
-- sin precio no pasan a Consulta.
drop function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, numeric);
create function public.create_restoration(
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb,
  p_deposit_amount numeric default null,
  p_kind public.restoration_kind default 'normal'
)
returns table (id uuid, code text)
language plpgsql
set search_path = ''
as $$
declare
  v_kind public.restoration_kind := coalesce(p_kind, 'normal');
  v_payment_type public.payment_type :=
    case when coalesce(p_kind, 'normal') = 'normal' then p_payment_type else 'sin_definir' end;
  v_restoration public.restorations;
  v_piece jsonb;
  v_unpriced uuid[];
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

  if v_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, kind
  ) values (
    p_client_id,
    p_contact_id,
    v_payment_type,
    case when v_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when v_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    v_kind
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Un precio escrito solo lo acepta el admin (trigger pieces_guard_price). El estado
    -- inicial según el tipo lo pone el trigger pieces_apply_kind.
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, weight_grams, price, notes, urgent, quantity
    ) values (
      v_restoration.id,
      nullif(v_piece ->> 'workshop_id', '')::uuid,
      trim(coalesce(v_piece ->> 'description', '')),
      trim(coalesce(v_piece ->> 'measure', '')),
      nullif(v_piece ->> 'material_id', '')::uuid,
      trim(coalesce(v_piece ->> 'material_name', '')),
      private.uuid_array(v_piece -> 'material_ids'),
      nullif(v_piece ->> 'service_id', '')::uuid,
      trim(coalesce(v_piece ->> 'service_name', '')),
      nullif(v_piece ->> 'weight_grams', '')::numeric,
      case when v_kind = 'normal' then nullif(v_piece ->> 'price', '')::numeric end,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      private.piece_quantity(v_piece -> 'quantity')
    );
  end loop;

  -- Sin precio de venta la pieza pasa a Consulta para cotizarlo (pedido del 2026-10-14).
  -- Las guías internas u observadas no se cotizan.
  if v_kind = 'normal' then
    select coalesce(array_agg(p.id order by p.code), '{}'::uuid[]) into v_unpriced
    from public.pieces p
    where p.restoration_id = v_restoration.id and p.price is null;
    if cardinality(v_unpriced) > 0 then
      perform public.change_piece_status(v_unpriced, 'en_consulta', private.unpriced_note());
    end if;
  end if;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

revoke execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb,
  numeric, public.restoration_kind) from public, anon;
grant execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb,
  numeric, public.restoration_kind) to authenticated;

-- 8. Cambiar el tipo de una guía (admin y ventas). Solo mientras nada se cobró ni fue al
-- taller: sin orden de Shopify, sin pagos y sin piezas que hayan ido al taller (por
-- trabajo o en revisión abierta) o se hayan entregado.
--   * A Interna: las piezas vivas por aprobar pasan a Aprobada.
--   * A Observada: las piezas vivas pasan a Observada (sin costo de servicio ni
--     aprobación: como las que nacen en una guía observada, la guía queda Registrada).
--   * En ambas se vacía el precio de venta y el tipo de pago queda "Sin definir".
--   * A Normal: las piezas quedan como están (el admin asigna los precios).
-- El estado general se vuelve a calcular.
create function public.set_restoration_kind(p_restoration_id uuid, p_kind public.restoration_kind)
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
      update public.pieces p set status = 'observada', observed_at = now(), approved_at = null
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

revoke execute on function public.set_restoration_kind(uuid, public.restoration_kind) from public, anon;
grant execute on function public.set_restoration_kind(uuid, public.restoration_kind) to authenticated;
