-- Cotizador de productos personalizados (Fase 14).
-- P34 (pendiente, se usa su propuesta): historial con estados Borrador, Emitida,
-- Aceptada y Rechazada; "Vencida" no se guarda: es una emitida cuya vigencia ya pasó.
-- P35 (pendiente, propuesta): solo soles; descuento opcional por línea (monto o %), sin
-- descuento global. P13 (pendiente, propuesta): los precios incluyen IGV.
-- Una cotización solo se edita en borrador; al emitirla quedan fijos los datos del
-- cliente (snapshot) y la fecha de emisión. Para cambiar una emitida se duplica.

create type public.quote_status as enum ('borrador', 'emitida', 'aceptada', 'rechazada');

-- Vigencia por defecto de la configuración (Paso 5.1).
create or replace function private.default_quote_validity_days()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select quote_validity_days from public.settings limit 1), 15);
$$;

-- Fecha calendario de hoy en Lima.
create or replace function private.lima_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Lima')::date;
$$;

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity unique,
  code text generated always as ('COT-' || lpad(number::text, 6, '0')) stored,
  status public.quote_status not null default 'borrador',
  client_id uuid not null references public.clients (id) on delete restrict,
  -- Contacto de la empresa a quien se dirige ("Atención:", P38).
  contact_id uuid references public.contacts (id) on delete restrict,
  -- Datos del cliente y del contacto al momento de cotizar (se refrescan hasta emitir).
  client_name text not null default '',
  client_document_type public.document_type,
  client_document_number text,
  client_phone text,
  client_email text,
  client_address text not null default '',
  contact_name text,
  contact_phone text,
  contact_email text,
  validity_days integer not null default private.default_quote_validity_days()
    check (validity_days between 1 and 365),
  -- Fecha de emisión (en Lima); vacía mientras es borrador.
  issue_date date,
  valid_until date generated always as (issue_date + validity_days) stored,
  issued_at timestamptz,
  notes text not null default '' check (length(notes) <= 2000),
  terms text not null default '' check (length(terms) <= 5000),
  -- Totales en soles (precios con IGV, P13); los recalcula el trigger de las líneas.
  subtotal numeric(16, 2) not null default 0,
  discount_total numeric(16, 2) not null default 0,
  total numeric(16, 2) not null default 0,
  duplicated_from uuid references public.quotes (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quotes_issue_shape check ((status = 'borrador') = (issue_date is null))
);

comment on table public.quotes is
  'Cotizaciones de productos personalizados (código COT-000001). Vencida = emitida con valid_until anterior a hoy.';

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete cascade,
  position smallint not null default 0 check (position >= 0),
  -- Producto y variante del catálogo de Shopify; vacíos en una línea libre (P37).
  shopify_product_id text,
  shopify_variant_id text,
  -- Datos del producto al momento de cotizar.
  title text not null check (length(trim(title)) between 1 and 200),
  variant_title text not null default '' check (length(variant_title) <= 200),
  sku text check (length(sku) <= 100),
  image_url text check (length(image_url) <= 2000),
  catalog_price numeric(10, 2) check (catalog_price >= 0),
  -- Descripción de la personalización.
  customization text not null default '' check (length(customization) <= 2000),
  quantity integer not null check (quantity between 1 and 100000),
  unit_price numeric(10, 2) not null check (unit_price >= 0),
  discount_type text check (discount_type in ('monto', 'porcentaje')),
  discount_value numeric(10, 2) not null default 0 check (discount_value >= 0),
  gross numeric(16, 2) generated always as (quantity * unit_price) stored,
  discount_amount numeric(16, 2) generated always as (
    case discount_type
      when 'porcentaje' then round(quantity * unit_price * discount_value / 100, 2)
      when 'monto' then discount_value
      else 0
    end
  ) stored,
  total numeric(16, 2) generated always as (
    quantity * unit_price - case discount_type
      when 'porcentaje' then round(quantity * unit_price * discount_value / 100, 2)
      when 'monto' then discount_value
      else 0
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint quote_items_variant_needs_product check (
    shopify_variant_id is null or shopify_product_id is not null
  ),
  constraint quote_items_discount_shape check (
    case discount_type
      when 'porcentaje' then discount_value <= 100
      when 'monto' then discount_value <= quantity * unit_price
      else discount_value = 0
    end
  )
);

comment on table public.quote_items is
  'Líneas de una cotización: producto de Shopify (con sus datos al cotizar) o línea libre (P37).';

create index quotes_client_idx on public.quotes (client_id, created_at desc);
create index quotes_status_idx on public.quotes (status, created_at desc);
create index quotes_created_at_idx on public.quotes (created_at desc);
create index quotes_client_name_trgm on public.quotes
  using gin (client_name extensions.gin_trgm_ops);
create index quote_items_quote_idx on public.quote_items (quote_id, position);

-- Copia los datos vigentes del cliente y del contacto en la cotización.
create or replace function private.quote_snapshot_client()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  c public.clients;
  k public.contacts;
begin
  if tg_op = 'UPDATE'
    and new.client_id is not distinct from old.client_id
    and new.contact_id is not distinct from old.contact_id
    and not (old.status = 'borrador' and new.status = 'emitida') then
    return new;
  end if;

  select * into c from public.clients where id = new.client_id;
  if new.contact_id is not null then
    select * into k from public.contacts where id = new.contact_id;
    if k.client_id is distinct from new.client_id then
      raise exception 'El contacto no pertenece al cliente de la cotización'
        using errcode = '23514';
    end if;
  end if;

  new.client_name := coalesce(c.display_name, '');
  new.client_document_type := c.document_type;
  new.client_document_number := c.document_number;
  new.client_phone := c.phone;
  new.client_email := c.email;
  new.client_address := coalesce(c.address, '');
  new.contact_name := k.display_name;
  new.contact_phone := k.phone;
  new.contact_email := k.email;
  return new;
end;
$$;

-- Reglas de edición y cambios de estado:
--   borrador → emitida (necesita al menos una línea; fija la fecha de emisión)
--   emitida → aceptada | rechazada; aceptada | rechazada → emitida (corrección)
-- Fuera del borrador solo cambia el estado.
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

create trigger quotes_guard_update
  before update on public.quotes
  for each row execute function private.quote_guard_update();

-- Después del guard: el snapshot al emitir usa los datos del cliente en ese momento.
create trigger quotes_snapshot_client
  before insert or update on public.quotes
  for each row execute function private.quote_snapshot_client();

create trigger quotes_set_updated_at before update on public.quotes
  for each row execute function private.set_updated_at();

-- Las líneas solo cambian mientras la cotización es borrador.
create or replace function private.quote_items_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.quote_id else new.quote_id end;
begin
  if tg_op = 'UPDATE' and new.quote_id <> old.quote_id then
    raise exception 'Una línea no cambia de cotización' using errcode = '23514';
  end if;
  if (select status from public.quotes where id = target) <> 'borrador' then
    raise exception 'Solo se pueden cambiar las líneas de una cotización en borrador'
      using errcode = '23514';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger quote_items_guard
  before insert or update or delete on public.quote_items
  for each row execute function private.quote_items_guard();

create trigger quote_items_set_updated_at before update on public.quote_items
  for each row execute function private.set_updated_at();

-- Totales de la cotización = suma de sus líneas (los usuarios no pueden escribirlos).
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
  set subtotal = t.subtotal, discount_total = t.discount_total, total = t.total
  from (
    select coalesce(sum(gross), 0) as subtotal,
      coalesce(sum(discount_amount), 0) as discount_total,
      coalesce(sum(total), 0) as total
    from public.quote_items where quote_id = target
  ) t
  where q.id = target
    and (q.subtotal, q.discount_total, q.total)
      is distinct from (t.subtotal, t.discount_total, t.total);
  return null;
end;
$$;

create trigger quote_items_recalculate_totals
  after insert or update or delete on public.quote_items
  for each row execute function private.recalculate_quote_totals();

-- Estado para mostrar: una emitida cuya vigencia ya pasó está "vencida".
-- Columna calculada de PostgREST: `select=*,effective_status`.
create or replace function public.effective_status(q public.quotes)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when q.status = 'emitida' and q.valid_until < private.lima_today() then 'vencida'
    else q.status::text
  end;
$$;

select audit.enable('public.quotes', '{code,valid_until,subtotal,discount_total,total}');
select audit.enable('public.quote_items', '{gross,discount_amount,total}');

revoke all on public.quotes, public.quote_items from anon, authenticated;
revoke execute on function private.default_quote_validity_days() from public, anon;
revoke execute on function private.lima_today() from public, anon;
revoke execute on function private.recalculate_quote_totals() from public, anon, authenticated;
revoke execute on function public.effective_status(public.quotes) from public, anon;
grant execute on function private.default_quote_validity_days() to authenticated;
grant execute on function private.lima_today() to authenticated;
grant execute on function public.effective_status(public.quotes) to authenticated;

-- Los usuarios no escriben el código, los totales, el snapshot ni las fechas de emisión.
grant select on public.quotes to authenticated;
grant insert (id, client_id, contact_id, validity_days, notes, terms, duplicated_from)
  on public.quotes to authenticated;
grant update (client_id, contact_id, status, validity_days, notes, terms)
  on public.quotes to authenticated;

grant select, delete on public.quote_items to authenticated;
grant insert (
  id, quote_id, position, shopify_product_id, shopify_variant_id, title, variant_title, sku,
  image_url, catalog_price, customization, quantity, unit_price, discount_type, discount_value
) on public.quote_items to authenticated;
grant update (
  position, shopify_product_id, shopify_variant_id, title, variant_title, sku, image_url,
  catalog_price, customization, quantity, unit_price, discount_type, discount_value
) on public.quote_items to authenticated;

alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

-- El cotizador es de ventas y admin (P38, permiso cotizador.usar); logística no lo ve.
create policy "Admin y ventas leen las cotizaciones"
  on public.quotes for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas crean cotizaciones"
  on public.quotes for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan cotizaciones"
  on public.quotes for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas leen las líneas"
  on public.quote_items for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas agregan líneas"
  on public.quote_items for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan líneas"
  on public.quote_items for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas quitan líneas"
  on public.quote_items for delete to authenticated
  using ((select private.has_role('{admin,ventas}')));
