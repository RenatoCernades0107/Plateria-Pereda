-- Precio de venta sin asignar (pedido del 2026-10-12, D58).
--   * El precio de venta de la pieza (`pieces.price`) ya no sale del servicio: nace
--     "Sin asignar" (null) y lo asigna después el administrador.
--   * Solo el admin pone o cambia el precio (ventas lo ve, logística no). Lo exige el
--     trigger `pieces_guard_price` en las peticiones de usuarios. Excepciones:
--       - "Crear restauración" desde una cotización de WhatsApp conserva el precio
--         cotizado aunque la copie ventas (`app.quote_copy_price`).
--       - `change_piece_price` (admin, con la orden creada; `app.shopify_order_edit`).
--   * La orden de Shopify espera a que todas las piezas que se cobran (aprobadas y no
--     cerradas) tengan precio: asignar el último precio la encola.
--   * Una pieza sin precio suma 0 al total.
--   * Las cotizaciones de WhatsApp no cambian: su precio es lo que ventas le cotiza al
--     cliente y sigue siendo obligatorio.

-- 1. El precio es opcional.
alter table public.pieces alter column price drop not null;

comment on column public.pieces.price is
  'Precio de venta (sin IGV si la restauración no lo incluye). Null: sin asignar; solo el admin lo asigna.';

-- 2. Total y precio con IGV: una pieza sin precio suma 0.
create or replace function public.price_with_igv(p_price numeric, p_include boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  -- Sin precio (null) devuelve null: quien suma decide cuánto vale.
  select case when p_include then p_price else p_price + round(p_price * 18 / 100, 2) end;
$$;

create or replace function private.restoration_total(p_restoration_id uuid, p_include boolean)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(public.price_with_igv(p.price, p_include), 0)), 0)
  from public.pieces p
  where p.restoration_id = p_restoration_id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

-- 3. Solo el admin pone o cambia el precio de venta.
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
  -- Copia del precio cotizado por WhatsApp y cambio de precio con la orden creada.
  if coalesce(current_setting('app.quote_copy_price', true), '') = 'on'
     or coalesce(current_setting('app.shopify_order_edit', true), '') = 'on' then
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

revoke execute on function private.guard_piece_price() from public, anon, authenticated;

create trigger pieces_guard_price
  before insert or update of price on public.pieces
  for each row execute function private.guard_piece_price();

-- 4. Edición: con la orden creada el precio asignado se cambia solo por el flujo de la
--    orden, y el de una pieza entregada no se cambia; pero una pieza sin precio sí
--    recibe el suyo (así entra a la orden).
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
    new.service_name, new.weight_grams, new.workshop_id, new.urgent
  ) is distinct from (
    old.description, old.measure, old.material_id, old.material_name, old.service_id,
    old.service_name, old.weight_grams, old.workshop_id, old.urgent
  ) then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if old.status = 'entregada' and old.price is not null
     and new.price is distinct from old.price then
    raise exception 'De una pieza entregada solo se editan las notas' using errcode = '23514';
  end if;

  if new.price is distinct from old.price and old.price is not null
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

-- 5. Orden de Shopify: todas las piezas que se cobran aprobadas y con precio.
create or replace function public.is_ready_for_shopify_order(p_pieces jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and((e ->> 'approvedAt') is not null and (e ->> 'price') is not null), false)
  from jsonb_array_elements(coalesce(p_pieces, '[]')) e
  where e ->> 'status' not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

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
  -- agregó una pieza antes de procesarlo) no cuenta: se vuelve a encolar.
  if v_restoration.shopify_order_id is null
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

-- Asignar el último precio también encola la orden.
drop trigger pieces_sync_restoration_status on public.pieces;
create trigger pieces_sync_restoration_status
  after insert or update of status, approved_at, first_sent_at, last_sent_at, last_returned_at, price
  on public.pieces
  for each row execute function private.sync_restoration_status();

-- 6. Registro: el precio es opcional (vacío = sin asignar).
create or replace function public.create_restoration(p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true)
 returns table(id uuid, code text)
 language plpgsql
 set search_path to ''
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

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, notes, prices_include_igv
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, ''),
    coalesce(p_prices_include_igv, true)
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Un precio escrito solo lo acepta el admin (trigger pieces_guard_price).
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
      nullif(v_piece ->> 'price', '')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

-- 7. Copia de una cotización de WhatsApp: la pieza cotizada conserva su precio aunque
--    la copie ventas. Un precio distinto, o el de una pieza nueva, solo lo pone el admin.
create or replace function public.create_restoration_from_whatsapp_quote(p_quote_id uuid, p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true)
 returns table(id uuid, code text)
 language plpgsql
 security definer
 set search_path to ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
  v_price numeric;
  v_seen uuid[] := '{}'::uuid[];
  v_new uuid;
  v_status text;
  v_note text;
  v_approved uuid[] := '{}'::uuid[];
  v_consult jsonb := '[]'::jsonb;
  v_step jsonb;
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
    client_id, contact_id, payment_type, deposit_percent, notes, origin, whatsapp_quote_id,
    prices_include_igv
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, ''),
    'whatsapp',
    v_quote.id,
    coalesce(p_prices_include_igv, true)
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Estado inicial elegido por pieza (P49): Consulta (con nota) o Aprobada.
    v_status := v_piece ->> 'status';
    if v_status is null or v_status not in ('en_consulta', 'aprobada') then
      raise exception 'Elige el estado inicial de cada pieza.' using errcode = '23514';
    end if;
    v_note := nullif(trim(coalesce(v_piece ->> 'status_note', '')), '');
    if v_status = 'en_consulta' and v_note is null then
      raise exception 'Escribe una nota para este cambio de estado.' using errcode = '23514';
    end if;
    v_item := nullif(v_piece ->> 'quote_item_id', '')::uuid;
    v_price := nullif(v_piece ->> 'price', '')::numeric;
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
      -- El precio cotizado se conserva aunque copie ventas.
      if exists (
        select 1 from public.whatsapp_quote_items i where i.id = v_item and i.price = v_price
      ) then
        perform set_config('app.quote_copy_price', 'on', true);
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
      v_price,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
    perform set_config('app.quote_copy_price', '', true);
    if v_status = 'aprobada' then
      v_approved := v_approved || v_new;
    else
      v_consult := v_consult || jsonb_build_object('id', v_new, 'note', v_note);
    end if;
  end loop;

  -- Cada pieza pasa al estado elegido (P49). La nota es por pieza y
  -- change_piece_status aplica una sola nota por llamada.
  if cardinality(v_approved) > 0 then
    perform public.change_piece_status(v_approved, 'aprobada');
  end if;
  for v_step in select value from jsonb_array_elements(v_consult)
  loop
    perform public.change_piece_status(
      array[(v_step ->> 'id')::uuid], 'en_consulta', v_step ->> 'note'
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;
