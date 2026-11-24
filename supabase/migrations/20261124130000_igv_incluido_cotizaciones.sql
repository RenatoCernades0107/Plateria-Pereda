-- IGV incluido en los precios del cotizador (`COT-`, pedido del 2026-11-24).
-- Los precios de las líneas YA INCLUYEN el IGV (18 %), así que el IGV no se suma: se
-- desglosa. Con `prices_include_igv`:
--   * bruto = subtotal − descuentos (ambos con IGV) es lo que paga el cliente: total = bruto.
--   * base = bruto ÷ 1.18 y IGV = bruto − base, con un solo redondeo a céntimos (igual que
--     `quoteTotals()` de src/domain/quote.ts; `round()` de numeric aleja el medio céntimo
--     del cero, y con 18 % no existen empates).
--   * `apply_igv` sigue siendo la casilla: desmarcada, no hay IGV (total = bruto).
-- RIESGO: las cotizaciones ya creadas guardan `total = subtotal − descuentos + IGV` con
-- precios sin IGV (20261103130000). Para no cambiarles el total, `prices_include_igv` es
-- false en las existentes (conservan el cálculo anterior) y true por defecto en las
-- nuevas. La cotización lo fija al crearse (no se puede actualizar) y duplicar lo copia
-- (los mismos precios con el mismo significado).

alter table public.quotes
  add column prices_include_igv boolean not null default false;

-- Las existentes quedaron en false; desde ahora, por defecto los precios incluyen IGV.
alter table public.quotes alter column prices_include_igv set default true;

comment on column public.quotes.prices_include_igv is
  'Los precios de las líneas incluyen el IGV (18 %): total = subtotal − descuentos y el IGV se desglosa. False en las cotizaciones anteriores a 2026-11-24 (sus precios no lo incluyen y el IGV se sumaba).';

-- Solo al crear (no se actualiza: cambiarlo alteraría el total de una cotización hecha).
grant insert (prices_include_igv) on public.quotes to authenticated;

-- 1. IGV que va incluido en un bruto: bruto − bruto ÷ 1.18.
create or replace function private.quote_igv_included(p_gross numeric, p_apply boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_apply then p_gross - round(p_gross * 100 / 118, 2) else 0 end;
$$;

revoke execute on function private.quote_igv_included(numeric, boolean) from public, anon, authenticated;

-- 2. IGV y total en cada insert/update (resto como 20261103130000: las líneas solo
--    actualizan subtotal y descuentos, `recalculate_quote_totals` no cambia).
create or replace function private.quote_set_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prices_include_igv then
    new.igv := private.quote_igv_included(new.subtotal - new.discount_total, new.apply_igv);
    new.total := new.subtotal - new.discount_total;
  else
    new.igv := private.quote_igv(new.subtotal - new.discount_total, new.apply_igv);
    new.total := new.subtotal - new.discount_total + new.igv;
  end if;
  return new;
end;
$$;

revoke execute on function private.quote_set_totals() from public, anon, authenticated;

-- 3. Guardar lee `prices_include_igv` solo al crear (true si falta); al editar se conserva
--    (resto como 20261105120100).
create or replace function public.save_quote(p_id uuid, p_quote jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_status public.quote_status;
  v_count integer;
  v_condition public.quote_payment_condition;
  v_credit_days integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos una línea' using errcode = '23514';
  end if;

  -- Condición que quedará (al editar, sin dato se conserva la que había) y sus días de
  -- crédito: solo en crédito, 30 si no se indican.
  v_condition := coalesce(
    nullif(p_quote ->> 'payment_condition', '')::public.quote_payment_condition,
    (select q.payment_condition from public.quotes q where q.id = p_id),
    'contado'
  );
  v_credit_days := case when v_condition = 'credito'
    then coalesce(
      (p_quote ->> 'credit_days')::integer,
      (select q.credit_days from public.quotes q where q.id = p_id),
      30
    )
  end;

  if p_id is null then
    insert into public.quotes (
      id, client_id, contact_id, validity_days, notes, terms, payment_condition,
      delivery_days, apply_igv, prices_include_igv, credit_days, issuer_id
    )
    values (
      v_id,
      (p_quote ->> 'client_id')::uuid,
      nullif(p_quote ->> 'contact_id', '')::uuid,
      coalesce((p_quote ->> 'validity_days')::integer, private.default_quote_validity_days()),
      coalesce(p_quote ->> 'notes', ''),
      coalesce(p_quote ->> 'terms', ''),
      coalesce(
        nullif(p_quote ->> 'payment_condition', '')::public.quote_payment_condition,
        'contado'
      ),
      coalesce((p_quote ->> 'delivery_days')::integer, 30),
      coalesce((p_quote ->> 'apply_igv')::boolean, true),
      coalesce((p_quote ->> 'prices_include_igv')::boolean, true),
      v_credit_days,
      nullif(p_quote ->> 'issuer_id', '')::uuid
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
      terms = coalesce(p_quote ->> 'terms', ''),
      payment_condition = coalesce(
        nullif(p_quote ->> 'payment_condition', '')::public.quote_payment_condition,
        payment_condition
      ),
      delivery_days = coalesce((p_quote ->> 'delivery_days')::integer, delivery_days),
      apply_igv = coalesce((p_quote ->> 'apply_igv')::boolean, apply_igv),
      credit_days = v_credit_days,
      issuer_id = case when p_quote ? 'issuer_id'
        then nullif(p_quote ->> 'issuer_id', '')::uuid else issuer_id end
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
    discount_value, reference_image_path
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
    coalesce((i ->> 'discount_value')::numeric, 0),
    nullif(i ->> 'reference_image_path', '')
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
    discount_value = excluded.discount_value,
    reference_image_path = excluded.reference_image_path
  -- Una línea de otra cotización no se toca (y se rechaza abajo).
  where public.quote_items.quote_id = excluded.quote_id;

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Una línea pertenece a otra cotización' using errcode = '23514';
  end if;

  return v_id;
end;
$function$;

-- 4. Duplicar conserva cómo se escribieron los precios (resto como 20261106120000).
create or replace function public.duplicate_quote(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.quotes (
    id, client_id, contact_id, validity_days, notes, terms, payment_condition,
    delivery_days, apply_igv, prices_include_igv, credit_days, issuer_id, workshop_notes,
    duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms,
    q.payment_condition, q.delivery_days, q.apply_igv, q.prices_include_igv,
    q.credit_days, q.issuer_id, q.workshop_notes, q.id
  from public.quotes q
  where q.id = p_id;
  if not found then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;

  insert into public.quote_items (
    quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value, reference_image_path
  )
  select v_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
    image_url, catalog_price, customization, quantity, unit_price, discount_type,
    discount_value, reference_image_path
  from public.quote_items
  where quote_id = p_id
  order by position;

  return v_id;
end;
$function$;
