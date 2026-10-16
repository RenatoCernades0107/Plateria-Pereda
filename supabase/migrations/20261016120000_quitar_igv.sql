-- Sin IGV (pedido del 2026-10-16): el IGV se maneja fuera del sistema. Ya no se pregunta
-- si el precio lo incluye ni se suma nunca: el total de una restauración, de una
-- cotización de WhatsApp o del cotizador es la suma de los precios tal como se escriben.
-- Se quitan la columna `prices_include_igv` (restorations, whatsapp_quotes y quotes),
-- `public.price_with_igv()`, los triggers que recalculaban el total al cambiarla y el
-- parámetro `p_prices_include_igv` de los RPC. Los totales ya guardados se recalculan
-- sin el IGV que se les había sumado.

-- 1. Triggers y funciones de la respuesta.
drop trigger restorations_apply_igv on public.restorations;
drop trigger whatsapp_quotes_apply_igv on public.whatsapp_quotes;
drop trigger quotes_apply_igv on public.quotes;
drop function private.apply_restoration_igv();
drop function private.apply_whatsapp_quote_igv();
drop function private.apply_quote_igv();

-- El estado de pago se recalcula al cambiar el total o lo pagado (antes también al
-- cambiar el IGV).
drop trigger restorations_set_payment_status on public.restorations;
create trigger restorations_set_payment_status
  before update of total, paid on public.restorations
  for each row execute function private.set_payment_status();

-- 2. Totales: suma de los precios, sin IGV.
create or replace function private.restoration_total(p_restoration_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(coalesce(p.price, 0)), 0)
  from public.pieces p
  where p.restoration_id = p_restoration_id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

revoke execute on function private.restoration_total(uuid) from public, anon, authenticated;

create or replace function private.recalculate_restoration_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restorations r
  set total = private.restoration_total(r.id)
  where r.id = new.restoration_id;
  return null;
end;
$$;

drop function private.restoration_total(uuid, boolean);

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
    select sum(i.price) from public.whatsapp_quote_items i where i.quote_id = q.id
  ), 0)
  where q.id = v_quote;
  return null;
end;
$$;

create or replace function private.quote_total(p_quote_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(i.total), 0)
  from public.quote_items i
  where i.quote_id = p_quote_id;
$$;

revoke execute on function private.quote_total(uuid) from public, anon, authenticated;

create or replace function private.recalculate_quote_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
begin
  update public.quotes q
  set subtotal = t.subtotal, discount_total = t.discount_total,
    total = private.quote_total(q.id)
  from (
    select coalesce(sum(gross), 0) as subtotal,
      coalesce(sum(discount_amount), 0) as discount_total
    from public.quote_items where quote_id = target
  ) t
  where q.id = target
    and (q.subtotal, q.discount_total, q.total)
      is distinct from (t.subtotal, t.discount_total, private.quote_total(q.id));
  return null;
end;
$$;

drop function private.quote_total(uuid, boolean);

create or replace function private.quote_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'borrador' and (
    new.client_id is distinct from old.client_id
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
  ) then
    raise exception 'Solo se puede editar una cotización en borrador'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status then
    if not (
      (old.status = 'borrador' and new.status = 'emitida')
      or (old.status = 'emitida' and new.status in ('aceptada', 'rechazada'))
      or (old.status in ('aceptada', 'rechazada') and new.status = 'emitida')
    ) then
      raise exception 'No se puede pasar una cotización de % a %', old.status, new.status
        using errcode = '23514';
    end if;
    if old.status = 'borrador' then
      if not exists (select 1 from public.quote_items where quote_id = new.id) then
        raise exception 'La cotización necesita al menos una línea para emitirse'
          using errcode = '23514';
      end if;
      new.issue_date := private.lima_today();
      new.issued_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- 3. Fuera la columna y la función del precio con IGV.
alter table public.restorations drop column prices_include_igv;
alter table public.whatsapp_quotes drop column prices_include_igv;
alter table public.quotes drop column prices_include_igv;
drop function public.price_with_igv(numeric, boolean);

comment on column public.pieces.price is
  'Precio de venta. Null: sin asignar; solo el admin lo asigna.';
comment on column public.whatsapp_quote_items.price is
  'Precio cotizado. Null: por definir.';

-- 4. Los totales guardados con IGV sumado se recalculan sin él.
update public.restorations r
set total = private.restoration_total(r.id)
where r.total is distinct from private.restoration_total(r.id);

update public.whatsapp_quotes q
set total = coalesce((
  select sum(i.price) from public.whatsapp_quote_items i where i.quote_id = q.id
), 0)
where q.total is distinct from coalesce((
  select sum(i.price) from public.whatsapp_quote_items i where i.quote_id = q.id
), 0);

update public.quotes q
set total = private.quote_total(q.id)
where q.total is distinct from private.quote_total(q.id);

-- 5. Registro, edición y cotizaciones sin la respuesta del IGV.
drop function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, boolean, numeric);
drop function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb, boolean, numeric);
drop function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean);
drop function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb, boolean);

create or replace function public.create_restoration(p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_deposit_amount numeric DEFAULT NULL::numeric)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
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

  if p_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when p_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, '')
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Un precio escrito solo lo acepta el admin (trigger pieces_guard_price).
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, weight_grams, price, notes, urgent
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
      nullif(v_piece ->> 'price', '')::numeric,
      coalesce(v_piece ->> 'notes', ''),
      coalesce((v_piece ->> 'urgent')::boolean, false)
    );
  end loop;

  -- Sin precio de venta la pieza pasa a Consulta para cotizarlo (pedido del 2026-10-14).
  select coalesce(array_agg(p.id order by p.code), '{}'::uuid[]) into v_unpriced
  from public.pieces p
  where p.restoration_id = v_restoration.id and p.price is null;
  if cardinality(v_unpriced) > 0 then
    perform public.change_piece_status(v_unpriced, 'en_consulta', private.unpriced_note());
  end if;

  return query select v_restoration.id, v_restoration.code;
end;
$function$;

revoke execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, numeric) from public, anon;
grant execute on function public.create_restoration(uuid, uuid, public.payment_type, numeric, text, jsonb, numeric) to authenticated, service_role;

create or replace function public.create_restoration_from_whatsapp_quote(p_quote_id uuid, p_client_id uuid, p_contact_id uuid, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_pieces jsonb, p_deposit_amount numeric DEFAULT NULL::numeric)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if p_payment_type = 'a_cuenta' and p_deposit_amount is not null and p_deposit_amount < 0 then
    raise exception 'El adelanto no puede ser negativo.' using errcode = '23514';
  end if;

  insert into public.restorations (
    client_id, contact_id, payment_type, deposit_percent, deposit_amount, notes, origin, whatsapp_quote_id
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    case when p_payment_type = 'a_cuenta' then p_deposit_amount end,
    coalesce(p_notes, ''),
    'whatsapp',
    v_quote.id
  )
  returning * into v_restoration;

  for v_piece in select value from jsonb_array_elements(p_pieces)
  loop
    if jsonb_typeof(v_piece) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    -- Estado inicial elegido por pieza (P49): Consulta (con nota) o Aprobada.
    v_status := v_piece ->> 'status';
    v_note := nullif(trim(coalesce(v_piece ->> 'status_note', '')), '');
    v_price := nullif(v_piece ->> 'price', '')::numeric;
    -- Sin precio de venta va a Consulta, elija lo que elija (pedido del 2026-10-14).
    if v_price is null then
      v_status := 'en_consulta';
      v_note := coalesce(v_note, private.unpriced_note());
    end if;
    if v_status is null or v_status not in ('en_consulta', 'aprobada') then
      raise exception 'Elige el estado inicial de cada pieza.' using errcode = '23514';
    end if;
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
      -- El precio cotizado se conserva aunque copie ventas.
      if exists (
        select 1 from public.whatsapp_quote_items i where i.id = v_item and i.price = v_price
      ) then
        perform set_config('app.quote_copy_price', 'on', true);
      end if;
    end if;
    insert into public.pieces (
      restoration_id, workshop_id, description, measure, material_id, material_name, material_ids,
      service_id, service_name, weight_grams, price, notes, urgent,
      whatsapp_quote_item_id
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
$function$;

revoke execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb, numeric) from public, anon;
grant execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb, numeric) to authenticated, service_role;

create or replace function public.create_whatsapp_quote(p_client_id uuid, p_contact_id uuid, p_customer_name text, p_customer_phone text, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_items jsonb)
 RETURNS TABLE(id uuid, code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_quote public.whatsapp_quotes;
begin
  perform private.check_whatsapp_quote_input(p_client_id, p_contact_id, p_items);
  insert into public.whatsapp_quotes (
    client_id, contact_id, customer_name, customer_phone, payment_type, deposit_percent, notes
  ) values (
    p_client_id,
    case when p_client_id is not null then p_contact_id end,
    case when p_client_id is null then trim(coalesce(p_customer_name, '')) else '' end,
    case when p_client_id is null then trim(coalesce(p_customer_phone, '')) else '' end,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
    coalesce(p_notes, '')
  )
  returning * into v_quote;
  perform private.insert_whatsapp_quote_items(v_quote.id, p_items);
  return query select v_quote.id, v_quote.code;
end;
$function$;

revoke execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) from public, anon;
grant execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.update_whatsapp_quote(p_id uuid, p_client_id uuid, p_contact_id uuid, p_customer_name text, p_customer_phone text, p_payment_type public.payment_type, p_deposit_percent numeric, p_notes text, p_items jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    notes = coalesce(p_notes, '')
  where q.id = p_id;
  delete from public.whatsapp_quote_items i where i.quote_id = p_id;
  perform private.insert_whatsapp_quote_items(p_id, p_items);
end;
$function$;

revoke execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) from public, anon;
grant execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.save_quote(p_id uuid, p_quote jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_status public.quote_status;
  v_count integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos una línea' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.quotes (
      id, client_id, contact_id, validity_days, notes, terms
    )
    values (
      v_id,
      (p_quote ->> 'client_id')::uuid,
      nullif(p_quote ->> 'contact_id', '')::uuid,
      coalesce((p_quote ->> 'validity_days')::integer, private.default_quote_validity_days()),
      coalesce(p_quote ->> 'notes', ''),
      coalesce(p_quote ->> 'terms', '')
    );
  else
    select status into v_status from public.quotes where id = p_id for update;
    if not found then
      raise exception 'La cotización no existe' using errcode = 'P0002';
    end if;
    if v_status <> 'borrador' then
      raise exception 'Solo se puede editar una cotización en borrador' using errcode = '23514';
    end if;
    update public.quotes set
      client_id = (p_quote ->> 'client_id')::uuid,
      contact_id = nullif(p_quote ->> 'contact_id', '')::uuid,
      validity_days = coalesce((p_quote ->> 'validity_days')::integer, validity_days),
      notes = coalesce(p_quote ->> 'notes', ''),
      terms = coalesce(p_quote ->> 'terms', '')
    where id = p_id;
  end if;

  delete from public.quote_items
  where quote_id = v_id
    and id not in (
      select (i ->> 'id')::uuid from jsonb_array_elements(p_items) i where i ->> 'id' is not null
    );

  insert into public.quote_items (
    id, quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title,
    sku, image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value
  )
  select
    coalesce((i ->> 'id')::uuid, gen_random_uuid()),
    v_id,
    (t.ord - 1)::smallint,
    nullif(i ->> 'shopify_product_id', ''),
    nullif(i ->> 'shopify_variant_id', ''),
    i ->> 'title',
    coalesce(i ->> 'variant_title', ''),
    nullif(i ->> 'sku', ''),
    nullif(i ->> 'image_url', ''),
    (i ->> 'catalog_price')::numeric,
    coalesce(i ->> 'customization', ''),
    (i ->> 'quantity')::integer,
    (i ->> 'unit_price')::numeric,
    nullif(i ->> 'discount_type', ''),
    coalesce((i ->> 'discount_value')::numeric, 0)
  from jsonb_array_elements(p_items) with ordinality as t(i, ord)
  on conflict (id) do update set
    position = excluded.position,
    shopify_product_id = excluded.shopify_product_id,
    shopify_variant_id = excluded.shopify_variant_id,
    title = excluded.title,
    variant_title = excluded.variant_title,
    sku = excluded.sku,
    image_url = excluded.image_url,
    catalog_price = excluded.catalog_price,
    customization = excluded.customization,
    quantity = excluded.quantity,
    unit_price = excluded.unit_price,
    discount_type = excluded.discount_type,
    discount_value = excluded.discount_value
  -- Una línea de otra cotización no se toca (y se rechaza abajo).
  where public.quote_items.quote_id = excluded.quote_id;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Una línea pertenece a otra cotización' using errcode = '23514';
  end if;

  return v_id;
end;
$function$;

create or replace function public.duplicate_quote(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.quotes (
    id, client_id, contact_id, validity_days, notes, terms, duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms, q.id
  from public.quotes q
  where q.id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;

  insert into public.quote_items (
    quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value
  )
  select v_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value
  from public.quote_items
  where quote_id = p_id
  order by position;

  return v_id;
end;
$function$;
