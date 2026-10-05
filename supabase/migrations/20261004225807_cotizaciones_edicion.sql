-- Editor de cotizaciones (Paso 14.4): guardar el borrador con sus líneas y duplicar
-- una cotización, cada uno en una sola transacción. Son security invoker: aplican la
-- RLS y los privilegios por columna de `quotes` y `quote_items` (solo admin y ventas).

-- Guarda una cotización en borrador (nueva si p_id es null) y deja exactamente las
-- líneas de p_items, en ese orden. Las líneas se identifican por su id: las que ya
-- existen se actualizan (el historial solo registra lo que cambió) y las que faltan
-- se quitan.
create or replace function public.save_quote(p_id uuid, p_quote jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_status public.quote_status;
  v_count integer;
begin
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización necesita al menos una línea' using errcode = '23514';
  end if;

  if p_id is null then
    insert into public.quotes (id, client_id, contact_id, validity_days, notes, terms)
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
$$;

comment on function public.save_quote(uuid, jsonb, jsonb) is
  'Guarda el borrador de una cotización con sus líneas (en orden) en una transacción.';

-- Copia una cotización (cualquier estado) como borrador nuevo: mismo cliente, contacto,
-- vigencia, notas, condiciones y líneas; los datos del cliente se toman de nuevo.
create or replace function public.duplicate_quote(p_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into public.quotes (id, client_id, contact_id, validity_days, notes, terms, duplicated_from)
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
$$;

comment on function public.duplicate_quote(uuid) is
  'Copia una cotización con sus líneas como un borrador nuevo (duplicated_from).';

revoke execute on function public.save_quote(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.duplicate_quote(uuid) from public, anon;
grant execute on function public.save_quote(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.duplicate_quote(uuid) to authenticated;
