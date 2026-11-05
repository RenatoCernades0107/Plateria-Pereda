-- Cotizaciones (`COT-`, pedido del 2026-11-05):
--   * Estado «Anulada» (enum en 20261105120000): una emitida, aceptada o rechazada que se
--     emitió por error se anula. Es definitivo (para corregirla se duplica). En el
--     dashboard se cuenta aparte y no suma al monto cotizado ni a la tasa de aceptación.
--   * Foto referencial por línea (`quote_items.reference_image_path`): vive en el
--     bucket privado `quote-images` bajo `{usuario}/{uuid}.{ext}` (se sube antes de
--     guardar, así sirve también para una cotización nueva). Admin y ventas (los del
--     cotizador) la ven y suben. Al duplicar se copia la ruta (la misma foto).

-- 1. Foto referencial de la línea.
alter table public.quote_items
  add column reference_image_path text check (
    length(reference_image_path) <= 300
    and reference_image_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

comment on column public.quote_items.reference_image_path is
  'Foto referencial del producto en el bucket quote-images; null si no tiene.';

grant insert (reference_image_path), update (reference_image_path)
  on public.quote_items to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'quote-images', 'quote-images', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp']
);

create policy "Admin y ventas ven las fotos de las cotizaciones"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'quote-images' and (select private.has_role('{admin,ventas}')));

create policy "Admin y ventas suben fotos a su carpeta de cotizaciones"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'quote-images'
    and (select private.has_role('{admin,ventas}'))
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 2. Anular (resto como 20261104130000).
create or replace function private.quote_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_today date := private.lima_today();
begin
  if old.status <> 'borrador' and (
    (new.client_id is distinct from old.client_id and not private.merging_clients())
    or new.contact_id is distinct from old.contact_id
    or new.validity_days is distinct from old.validity_days
    or new.notes is distinct from old.notes
    or new.terms is distinct from old.terms
    or new.payment_condition is distinct from old.payment_condition
    or new.delivery_days is distinct from old.delivery_days
    or new.credit_days is distinct from old.credit_days
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
      or (old.status in ('emitida', 'aceptada', 'rechazada') and new.status = 'anulada')
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

  -- Fechas de entrega: solo en las aceptadas.
  if new.status <> 'aceptada' then
    new.delivery_date := null;
    new.supplier_delivery_date := null;
    return new;
  end if;

  -- Obligatoria al aceptarla (o si se intenta borrar); las aceptadas de antes pueden
  -- seguir sin fecha hasta que se les coloque.
  if new.delivery_date is null
     and (old.status <> 'aceptada' or old.delivery_date is not null) then
    raise exception 'Indica la fecha de entrega.' using errcode = '23514';
  end if;

  if new.delivery_date is not null
     and new.delivery_date is distinct from old.delivery_date
     and new.delivery_date < v_today then
    raise exception 'La fecha de entrega no puede ser anterior a hoy.' using errcode = '23514';
  end if;

  -- Fecha del proveedor por defecto: 3 días antes de la de entrega, sin pasar de hoy.
  if new.delivery_date is not null and new.supplier_delivery_date is null then
    new.supplier_delivery_date := greatest(new.delivery_date - 3, v_today);
  end if;

  -- La fecha de entrega se adelantó por delante de la del proveedor (que no se tocó):
  -- se recalcula en vez de fallar.
  if new.delivery_date is distinct from old.delivery_date
     and new.supplier_delivery_date is not distinct from old.supplier_delivery_date
     and new.supplier_delivery_date > new.delivery_date then
    new.supplier_delivery_date := greatest(new.delivery_date - 3, v_today);
  end if;

  if new.supplier_delivery_date is not null
     and new.supplier_delivery_date is distinct from old.supplier_delivery_date
     and new.supplier_delivery_date < v_today then
    raise exception 'La fecha de entrega del proveedor no puede ser anterior a hoy.'
      using errcode = '23514';
  end if;

  if new.supplier_delivery_date > new.delivery_date then
    raise exception 'La fecha del proveedor no puede ser posterior a la de entrega.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- 3. Guardar y duplicar leen y copian la foto referencial.
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
      delivery_days, apply_igv, credit_days, issuer_id
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
    delivery_days, apply_igv, credit_days, issuer_id, duplicated_from
  )
  select v_id, q.client_id, q.contact_id, q.validity_days, q.notes, q.terms,
    q.payment_condition, q.delivery_days, q.apply_igv, q.credit_days, q.issuer_id, q.id
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

-- 4. Dashboard: las anuladas se cuentan aparte y no suman.
create or replace function public.dashboard_quotes(
  p_from date, p_to date, p_bucket text default 'dia'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start timestamptz := private.dash_start(p_from);
  v_end timestamptz := private.dash_start(p_to + 1);
  v_cwa jsonb;
  v_reasons jsonb;
  v_cot jsonb;
  v_origin jsonb;
  v_series jsonb;
begin
  perform private.dash_guard(p_from, p_to, p_bucket);
  select jsonb_build_object(
           'created', count(*),
           'cotizada', count(*) filter (where q.status = 'cotizada'),
           'pedida_parcial', count(*) filter (where q.status = 'pedida_parcial'),
           'pedida', count(*) filter (where q.status = 'pedida'),
           'descartada', count(*) filter (where q.status = 'descartada'),
           'quoted_amount', round(coalesce(sum(q.total), 0), 2),
           'items_quoted', coalesce(sum(it.n), 0),
           'items_ordered', coalesce(sum(it.ordered), 0),
           'ordered_amount', round(coalesce(sum(it.ordered_amount), 0), 2),
           'conversion', case when count(*) > 0
              then round(100.0 * count(*) filter (where q.status in ('pedida', 'pedida_parcial')) / count(*), 1) end,
           'item_conversion', case when coalesce(sum(it.n), 0) > 0
              then round(100.0 * coalesce(sum(it.ordered), 0) / sum(it.n), 1) end
         )
    into v_cwa
  from public.whatsapp_quotes q
  left join lateral (
    select count(*) n,
           count(*) filter (where lp.id is not null) ordered,
           sum(private.piece_amount(i.price, i.quantity)) filter (where lp.id is not null) ordered_amount
    from public.whatsapp_quote_items i
    left join lateral (
      select p.id from public.pieces p
      where p.whatsapp_quote_item_id = i.id
        and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
      limit 1
    ) lp on true
    where i.quote_id = q.id
  ) it on true
  where q.created_at >= v_start and q.created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object('label', reason, 'value', n) order by n desc), '[]')
    into v_reasons
  from (
    select left(lower(btrim(coalesce(nullif(btrim(q.discard_reason), ''), 'Sin motivo'))), 80) reason,
           count(*) n
    from public.whatsapp_quotes q
    where q.status = 'descartada' and q.discarded_at >= v_start and q.discarded_at < v_end
    group by 1 order by 2 desc limit 6
  ) r;

  select jsonb_build_object(
           'created', count(*),
           'borrador', count(*) filter (where public.effective_status(q) = 'borrador'),
           'emitida', count(*) filter (where public.effective_status(q) = 'emitida'),
           'aceptada', count(*) filter (where public.effective_status(q) = 'aceptada'),
           'rechazada', count(*) filter (where public.effective_status(q) = 'rechazada'),
           'vencida', count(*) filter (where public.effective_status(q) = 'vencida'),
           'anulada', count(*) filter (where q.status = 'anulada'),
           'amount', round(coalesce(sum(q.total) filter (where q.status not in ('borrador', 'anulada')), 0), 2),
           'accepted_amount', round(coalesce(sum(q.total) filter (where q.status = 'aceptada'), 0), 2),
           'acceptance', case when count(*) filter (where q.status not in ('borrador', 'anulada')) > 0
              then round(100.0 * count(*) filter (where q.status = 'aceptada')
                         / count(*) filter (where q.status not in ('borrador', 'anulada')), 1) end
         )
    into v_cot
  from public.quotes q
  where q.created_at >= v_start and q.created_at < v_end;

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', o.origin, 'orders', coalesce(g.orders, 0), 'sold', coalesce(s.sold, 0),
           'ticket', case when coalesce(s.sold_orders, 0) > 0 then round(s.sold / s.sold_orders, 2) else 0 end
         ) order by o.origin), '[]')
    into v_origin
  from unnest(enum_range(null::public.restoration_origin)) as o(origin)
  left join (
    select r.origin, count(*) orders from public.restorations r
    where r.kind = 'normal' and r.created_at >= v_start and r.created_at < v_end group by 1
  ) g on g.origin = o.origin
  left join (
    select origin, round(sum(amount), 2) sold, count(distinct restoration_id) sold_orders
    from private.dash_sold(p_from, p_to) group by origin
  ) s on s.origin = o.origin;

  select coalesce(jsonb_agg(jsonb_build_object(
           'd', b.b, 'cotizadas', coalesce(c.created, 0), 'pedidas', coalesce(c.converted, 0)
         ) order by b.b), '[]'::jsonb)
    into v_series
  from private.dash_buckets(p_from, p_to, p_bucket) b
  left join (
    select private.dash_bucket_of((q.created_at at time zone 'America/Lima')::date, p_bucket) k,
           count(*) created,
           count(*) filter (where q.status in ('pedida', 'pedida_parcial')) converted
    from public.whatsapp_quotes q
    where q.created_at >= v_start and q.created_at < v_end group by 1
  ) c on c.k = b.b;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'bucket', p_bucket,
    'cwa', v_cwa, 'discard_reasons', v_reasons, 'cot', v_cot,
    'by_origin', v_origin, 'series', v_series
  );
end;
$$;
