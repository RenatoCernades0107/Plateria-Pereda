-- Días de crédito y sucursal emisora de las cotizaciones (`COT-`, pedido del 2026-11-04).
--   * `credit_days`: con la condición «Crédito» se indican los días (1 a 365, por
--     defecto 30); el PDF dice «Crédito a N días». Solo en crédito; como la condición,
--     solo cambia en borrador y al duplicar se copia.
--   * `quote_issuers` («Sucursales de cotización»): quién cobra la cotización, con su
--     razón social, DNI/RUC y cuenta bancaria. Salen en el PDF encima de «Atentamente,»
--     (de una persona con DNI, solo la cuenta). Es un catálogo aparte de `branches`
--     (las sucursales que cobran los pagos en Shopify). Lo gestiona el admin en
--     Configuración; ventas solo lo lee. Se borra mientras ninguna cotización la use.
--   * `quotes.issuer_id`: la sucursal de la cotización. Sin ella no se genera el PDF.
--     Se puede elegir o cambiar en cualquier estado (no es un dato del precio), así las
--     ya emitidas también pueden sacar su PDF. Al duplicar se copia.

-- 1. Días de crédito.
alter table public.quotes
  add column credit_days integer check (credit_days between 1 and 365);

update public.quotes set credit_days = 30 where payment_condition = 'credito';

alter table public.quotes
  add constraint quotes_credit_days_check_condition
    check ((payment_condition = 'credito') = (credit_days is not null));

comment on column public.quotes.credit_days is
  'Días de crédito (1 a 365) si la condición de pago es crédito; null en las demás.';

grant insert (credit_days), update (credit_days) on public.quotes to authenticated;

-- 2. Sucursales de cotización.
create table public.quote_issuers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 60),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  document_type text not null check (document_type in ('dni', 'ruc')),
  document_number text not null,
  bank_name text not null default 'Banco de Crédito (BCP)'
    check (length(trim(bank_name)) between 1 and 100),
  account_label text not null check (length(trim(account_label)) between 1 and 60),
  account_number text not null check (account_number ~ '^[0-9-]{6,30}$'),
  cci text not null check (cci ~ '^[0-9]{20}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_issuers_document_number_check check (
    (document_type = 'dni' and document_number ~ '^[0-9]{8}$')
    or (document_type = 'ruc' and document_number ~ '^[0-9]{11}$')
  )
);
comment on table public.quote_issuers is
  'Sucursales que emiten las cotizaciones: razón social, DNI/RUC y cuenta bancaria del PDF.';

create unique index quote_issuers_name_key on public.quote_issuers (lower(trim(name)));

create trigger quote_issuers_set_updated_at before update on public.quote_issuers
  for each row execute function private.set_updated_at();

insert into public.quote_issuers (
  name, legal_name, document_type, document_number, account_label, account_number, cci
) values
  ('CARMEN', 'Regina Pereda Luque', 'dni', '07863594', 'CTA AHORRO soles',
    '19493993660088', '00219419399366008899'),
  ('PEREDA SAC', 'PEREDA SAC', 'ruc', '20557169866', 'CTA CTE soles',
    '1942229780029', '00219400222978002998'),
  ('PEREDA''S CTA SRL.', 'PEREDA''S 4TA G SRL', 'ruc', '20124352828', 'CTA CTE soles',
    '1940637923065', '00219400063792306596');

select audit.enable('public.quote_issuers');

revoke all on public.quote_issuers from anon, authenticated;
grant select, insert, update, delete on public.quote_issuers to authenticated;

alter table public.quote_issuers enable row level security;

-- Como el cotizador: admin y ventas las leen (logística no ve sus datos bancarios).
create policy "Admin y ventas leen las sucursales de cotización"
  on public.quote_issuers for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Solo admin crea sucursales de cotización"
  on public.quote_issuers for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "Solo admin edita sucursales de cotización"
  on public.quote_issuers for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));
create policy "Solo admin borra sucursales de cotización"
  on public.quote_issuers for delete to authenticated
  using ((select private.has_role('{admin}')));

create or replace function private.block_quote_issuer_delete_in_use()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quotes bigint;
begin
  select count(*) into v_quotes from public.quotes where issuer_id = old.id;
  if v_quotes > 0 then
    raise exception '“%” está en uso en %. Desactívala en su lugar.',
      old.name, private.count_label(v_quotes, 'cotización', 'cotizaciones')
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke execute on function private.block_quote_issuer_delete_in_use()
  from public, anon, authenticated;

create trigger quote_issuers_block_delete_in_use
  before delete on public.quote_issuers
  for each row execute function private.block_quote_issuer_delete_in_use();

-- 3. Sucursal de la cotización (editable en cualquier estado: no va en el guard).
alter table public.quotes
  add column issuer_id uuid references public.quote_issuers (id);

comment on column public.quotes.issuer_id is
  'Sucursal que emite la cotización (razón social, RUC y cuenta del PDF).';

create index quotes_issuer_idx on public.quotes (issuer_id);

grant insert (issuer_id), update (issuer_id) on public.quotes to authenticated;

-- 4. Fuera de borrador tampoco cambian los días de crédito (resto como 20261103140000).
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

-- 5. Guardar lee `credit_days` e `issuer_id`.
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

-- 6. Duplicar copia los días de crédito y la sucursal.
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
