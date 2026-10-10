-- IGV en el cotizador de productos (P13, D54): como en las restauraciones, cada
-- cotización indica si sus precios incluyen IGV. Si no lo incluyen, cada línea (ya con
-- su descuento) se cobra + 18 % redondeado a céntimos y el total es la suma de esas
-- líneas (igual que quoteTotals() de src/domain/quote.ts). Subtotal y descuentos
-- quedan sin IGV. Las cotizaciones existentes quedan con IGV incluido.

alter table public.quotes
  add column prices_include_igv boolean not null default true;

comment on column public.quotes.prices_include_igv is
  'Los precios de las líneas incluyen IGV; si no, el total suma el 18 % de cada línea (P13).';

grant insert (prices_include_igv), update (prices_include_igv) on public.quotes to authenticated;

-- 1. Totales de la cotización con IGV.
create or replace function private.quote_total(p_quote_id uuid, p_include boolean)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(public.price_with_igv(i.total, p_include)), 0)
  from public.quote_items i
  where i.quote_id = p_quote_id;
$$;

revoke execute on function private.quote_total(uuid, boolean) from public, anon, authenticated;

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
    total = private.quote_total(q.id, q.prices_include_igv)
  from (
    select coalesce(sum(gross), 0) as subtotal,
      coalesce(sum(discount_amount), 0) as discount_total
    from public.quote_items where quote_id = target
  ) t
  where q.id = target
    and (q.subtotal, q.discount_total, q.total)
      is distinct from (t.subtotal, t.discount_total, private.quote_total(q.id, q.prices_include_igv));
  return null;
end;
$$;

-- Cambiar la respuesta (solo en borrador, lo exige quote_guard_update) recalcula el total.
create or replace function private.apply_quote_igv()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.prices_include_igv is distinct from old.prices_include_igv then
    new.total := private.quote_total(new.id, new.prices_include_igv);
  end if;
  return new;
end;
$$;

revoke execute on function private.apply_quote_igv() from public, anon, authenticated;

create trigger quotes_apply_igv
  before update of prices_include_igv on public.quotes
  for each row execute function private.apply_quote_igv();

-- 2. Solo en borrador se cambia (como el resto de los datos).
CREATE OR REPLACE FUNCTION private.quote_guard_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
begin
  if old.status <> 'borrador' and (
    new.client_id is distinct from old.client_id
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.prices_include_igv is distinct from old.prices_include_igv
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

-- 3. Guardar y duplicar llevan la respuesta (p_quote.prices_include_igv).
CREATE OR REPLACE FUNCTION public.save_quote(p_id uuid, p_quote jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
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
      id, client_id, contact_id, validity_days, notes, terms, prices_include_igv
    )
    values (
      v_id,
      (p_quote ->> 'client_id')::uuid,
      nullif(p_quote ->> 'contact_id', '')::uuid,
      coalesce((p_quote ->> 'validity_days')::integer, private.default_quote_validity_days()),
      coalesce(p_quote ->> 'notes', ''),
      coalesce(p_quote ->> 'terms', ''),
      coalesce((p_quote ->> 'prices_include_igv')::boolean, true)
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
      prices_include_igv = coalesce((p_quote ->> 'prices_include_igv')::boolean, prices_include_igv)
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
$$;

CREATE OR REPLACE FUNCTION public.duplicate_quote(p_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.quotes (
    id, client_id, contact_id, validity_days, notes, terms, duplicated_from, prices_include_igv
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms, q.id,
    q.prices_include_igv
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
$$;
