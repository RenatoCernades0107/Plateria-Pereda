-- IGV en el cotizador de productos personalizados (`COT-`, pedido del 2026-11-03).
-- Solo las cotizaciones de /cotizaciones: restauraciones y cotizaciones de WhatsApp
-- siguen sin IGV (20261016120000_quitar_igv.sql).
--   * `apply_igv`: "Sumar IGV (18 %)". Las nuevas parten marcadas; las existentes
--     quedan sin IGV para que no cambie el total de las ya emitidas.
--   * Los precios de las líneas se escriben sin IGV. IGV = 18 % de (subtotal −
--     descuentos), redondeado una sola vez a céntimos (igual que `quoteTotals()` de
--     src/domain/quote.ts). Total = subtotal − descuentos + IGV: es lo que paga el
--     cliente (el listado y el dashboard usan este total).
--   * Como el resto de los datos, solo se cambia en borrador; al duplicar se copia.

alter table public.quotes
  add column apply_igv boolean not null default false,
  add column igv numeric(16, 2) not null default 0 check (igv >= 0);

-- Las existentes quedaron en false (sin IGV); desde ahora, por defecto se suma.
alter table public.quotes alter column apply_igv set default true;

comment on column public.quotes.apply_igv is
  'Sumar el IGV (18 %) a subtotal − descuentos; los precios de las líneas no lo incluyen.';
comment on column public.quotes.igv is
  'IGV (18 % de subtotal − descuentos) si apply_igv; 0 si no. Lo calcula la BD.';

grant insert (apply_igv), update (apply_igv) on public.quotes to authenticated;

-- 1. IGV y total a partir de subtotal, descuentos y la casilla (en cada insert/update:
--    los cambios de líneas actualizan subtotal y descuentos; el usuario, la casilla).
create or replace function private.quote_igv(p_base numeric, p_apply boolean)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_apply then round(p_base * 18 / 100, 2) else 0 end;
$$;

revoke execute on function private.quote_igv(numeric, boolean) from public, anon, authenticated;

create or replace function private.quote_set_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.igv := private.quote_igv(new.subtotal - new.discount_total, new.apply_igv);
  new.total := new.subtotal - new.discount_total + new.igv;
  return new;
end;
$$;

revoke execute on function private.quote_set_totals() from public, anon, authenticated;

create trigger quotes_set_totals
  before insert or update on public.quotes
  for each row execute function private.quote_set_totals();

-- Las líneas solo actualizan subtotal y descuentos; el trigger de arriba pone IGV y total.
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
  set subtotal = t.subtotal, discount_total = t.discount_total
  from (
    select coalesce(sum(gross), 0) as subtotal,
      coalesce(sum(discount_amount), 0) as discount_total
    from public.quote_items where quote_id = target
  ) t
  where q.id = target
    and (q.subtotal, q.discount_total) is distinct from (t.subtotal, t.discount_total);
  return null;
end;
$$;

-- Ya no se usa: el total sale de subtotal, descuentos e IGV.
drop function private.quote_total(uuid);

-- 2. Fuera de borrador tampoco cambia la casilla del IGV (resto como 20261031120000).
create or replace function private.quote_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status <> 'borrador' and (
    (new.client_id is distinct from old.client_id and not private.merging_clients())
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.payment_condition is distinct from old.payment_condition
    or new.delivery_days is distinct from old.delivery_days
    or new.apply_igv is distinct from old.apply_igv
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

-- 3. Guardar lee `apply_igv` (si falta: true al crear; al editar se conserva).
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
      id, client_id, contact_id, validity_days, notes, terms, payment_condition,
      delivery_days, apply_igv
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
      coalesce((p_quote ->> 'apply_igv')::boolean, true)
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
      apply_igv = coalesce((p_quote ->> 'apply_igv')::boolean, apply_igv)
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

-- 4. Duplicar conserva la casilla del IGV.
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
    delivery_days, apply_igv, duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms,
    q.payment_condition, q.delivery_days, q.apply_igv, q.id
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

-- 5. Auditoría: el IGV es calculado (como subtotal y total), no se registra.
select audit.enable('public.quotes', '{code,valid_until,subtotal,discount_total,igv,total}');
