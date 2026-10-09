-- IGV (P13, D54): cada restauración y cada cotización de WhatsApp indican si sus
-- precios incluyen IGV. Si no lo incluyen, cada pieza se cobra a su precio + 18 %
-- redondeado a céntimos (igual que priceWithIgv() de src/domain/igv.ts), y el total,
-- el adelanto y la orden de Shopify usan ese monto. Las filas existentes quedan con
-- IGV incluido (lo que se asumía hasta ahora).

alter table public.restorations
  add column prices_include_igv boolean not null default true;
alter table public.whatsapp_quotes
  add column prices_include_igv boolean not null default true;

comment on column public.restorations.prices_include_igv is
  'Los precios de las piezas incluyen IGV; si no, se cobra el precio + 18 % (P13).';
comment on column public.whatsapp_quotes.prices_include_igv is
  'Los precios de las piezas incluyen IGV; si no, se cobra el precio + 18 % (P13).';

grant insert (prices_include_igv), update (prices_include_igv)
  on public.restorations to authenticated;

-- 1. Precio que se cobra.
create or replace function public.price_with_igv(p_price numeric, p_include boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_include then p_price else p_price + round(p_price * 18 / 100, 2) end;
$$;

revoke execute on function public.price_with_igv(numeric, boolean) from public, anon;
grant execute on function public.price_with_igv(numeric, boolean) to authenticated, service_role;

-- 2. Total de la restauración: piezas que se cobran, con IGV.
create or replace function private.restoration_total(p_restoration_id uuid, p_include boolean)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.price_with_igv(p.price, p_include)), 0)
  from public.pieces p
  where p.restoration_id = p_restoration_id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

revoke execute on function private.restoration_total(uuid, boolean) from public, anon, authenticated;

create or replace function private.recalculate_restoration_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restorations r
  set total = private.restoration_total(r.id, r.prices_include_igv)
  where r.id = new.restoration_id;
  return null;
end;
$$;

-- Cambiar la respuesta recalcula el total. Con la orden de Shopify creada ya no se
-- cambia (los precios de la orden ya se enviaron), salvo desde el flujo de la orden.
create or replace function private.apply_restoration_igv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prices_include_igv is distinct from old.prices_include_igv then
    if old.shopify_order_id is not null
       and coalesce(current_setting('app.shopify_order_edit', true), '') <> 'on' then
      raise exception 'Con la orden de Shopify creada ya no se cambia si el precio incluye IGV'
        using errcode = '23514';
    end if;
    new.total := private.restoration_total(new.id, new.prices_include_igv);
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_restoration_igv() from public, anon, authenticated;

create trigger restorations_apply_igv
  before update of prices_include_igv on public.restorations
  for each row execute function private.apply_restoration_igv();

-- 3. Total de la cotización de WhatsApp, con la misma regla.
create or replace function private.recalculate_whatsapp_quote_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote uuid := coalesce(new.quote_id, old.quote_id);
begin
  update public.whatsapp_quotes q
  set total = coalesce((
    select sum(public.price_with_igv(i.price, q.prices_include_igv))
    from public.whatsapp_quote_items i where i.quote_id = q.id
  ), 0)
  where q.id = v_quote;
  return null;
end;
$$;

create or replace function private.apply_whatsapp_quote_igv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prices_include_igv is distinct from old.prices_include_igv then
    new.total := coalesce((
      select sum(public.price_with_igv(i.price, new.prices_include_igv))
      from public.whatsapp_quote_items i where i.quote_id = new.id
    ), 0);
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_whatsapp_quote_igv() from public, anon, authenticated;

create trigger whatsapp_quotes_apply_igv
  before update of prices_include_igv on public.whatsapp_quotes
  for each row execute function private.apply_whatsapp_quote_igv();

-- 4. Registro y edición: la respuesta se envía siempre desde la aplicación.
drop function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb);
drop function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb);
drop function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb);
drop function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb);

CREATE OR REPLACE FUNCTION public.create_restoration(p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
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
      (v_piece ->> 'price')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  return query select v_restoration.id, v_restoration.code;
end;
$$;

revoke execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, boolean) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_restoration_from_whatsapp_quote(p_quote_id uuid, p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_prices_include_igv boolean DEFAULT true)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
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
      (v_piece ->> 'price')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
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

revoke execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb, boolean) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_whatsapp_quote(p_client_id uuid, p_contact_id uuid, p_customer_name text, p_customer_phone text, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_items jsonb, p_prices_include_igv boolean DEFAULT true)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_quote public.whatsapp_quotes;
begin
  perform private.check_whatsapp_quote_input(p_client_id, p_contact_id, p_items);
  insert into public.whatsapp_quotes (
    client_id, contact_id, customer_name, customer_phone, payment_type, deposit_percent, notes,
    prices_include_igv
  ) values (
    p_client_id,
    case when p_client_id is not null then p_contact_id end,
    case when p_client_id is null then trim(coalesce(p_customer_name, '')) else '' end,
    case when p_client_id is null then trim(coalesce(p_customer_phone, '')) else '' end,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, ''),
    coalesce(p_prices_include_igv, true)
  )
  returning * into v_quote;
  perform private.insert_whatsapp_quote_items(v_quote.id, p_items);
  return query select v_quote.id, v_quote.code;
end;
$$;

revoke execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_whatsapp_quote(p_id uuid, p_client_id uuid, p_contact_id uuid, p_customer_name text, p_customer_phone text, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_items jsonb, p_prices_include_igv boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $$
declare
  v_quote public.whatsapp_quotes;
begin
  perform private.check_whatsapp_quote_input(p_client_id, p_contact_id, p_items);
  select * into v_quote from public.whatsapp_quotes q where q.id = p_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status = 'descartada' then
    raise exception 'Una cotización descartada no se edita; reábrela primero' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.pieces p join public.whatsapp_quote_items i on i.id = p.whatsapp_quote_item_id
    where i.quote_id = p_id
  ) then
    raise exception 'La cotización ya se pasó a una restauración: no se edita' using errcode = '23514';
  end if;

  update public.whatsapp_quotes q set
    client_id = p_client_id,
    contact_id = case when p_client_id is not null then p_contact_id end,
    customer_name = case when p_client_id is null then trim(coalesce(p_customer_name, '')) else '' end,
    customer_phone = case when p_client_id is null then trim(coalesce(p_customer_phone, '')) else '' end,
    payment_type = p_payment_type,
    deposit_percent = case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    notes = coalesce(p_notes, ''),
    prices_include_igv = coalesce(p_prices_include_igv, true)
  where q.id = p_id;
  delete from public.whatsapp_quote_items i where i.quote_id = p_id;
  perform private.insert_whatsapp_quote_items(p_id, p_items);
end;
$$;

revoke execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean) from public, anon;
grant execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean) to authenticated, service_role;
