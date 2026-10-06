-- Cotizaciones de restauración por WhatsApp (P46, Fase 7B). Lo que llega por
-- WhatsApp es una cotización (CWA-00001), no una restauración: no va a Shopify, no
-- lleva fotos y no se mezcla con las restauraciones. "Crear restauración" copia las
-- piezas elegidas a una restauración normal (origen WhatsApp) en la que entran
-- Aprobadas; se puede repetir con las piezas pendientes.
--   * cliente opcional (nombre y teléfono libres, opcionales); obligatorio al copiar,
--     y la cotización queda vinculada a ese cliente;
--   * estados: cotizada, pedida_parcial, pedida (los calcula la BD) y descartada;
--   * se edita solo hasta la primera copia;
--   * solo admin y ventas (logística no la ve).
-- Las escrituras van por RPC (security definer con control de rol); la RLS deja leer
-- a admin y ventas.

create type public.whatsapp_quote_status as enum ('cotizada', 'pedida_parcial', 'pedida', 'descartada');
create type public.restoration_origin as enum ('oficina', 'whatsapp');

create sequence public.whatsapp_quote_code_seq;

create or replace function private.next_whatsapp_quote_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'CWA-' || lpad(n::text, greatest(5, length(n::text)), '0')
  from (select nextval('public.whatsapp_quote_code_seq') as n) s;
$$;

revoke execute on function private.next_whatsapp_quote_code() from public, anon;
grant execute on function private.next_whatsapp_quote_code() to authenticated, service_role;

create table public.whatsapp_quotes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_whatsapp_quote_code(),
  client_id uuid references public.clients (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete restrict,
  -- A quién se le cotizó cuando aún no es cliente (P46): ambos opcionales.
  customer_name text not null default '' check (length(customer_name) <= 200),
  customer_phone text not null default '' check (length(customer_phone) <= 30),
  payment_type public.payment_type not null,
  deposit_percent numeric(5, 2) check (deposit_percent between 1 and 100),
  notes text not null default '' check (length(notes) <= 2000),
  total numeric(12, 2) not null default 0 check (total >= 0),
  status public.whatsapp_quote_status not null default 'cotizada',
  discarded_at timestamptz,
  discard_reason text check (length(discard_reason) <= 1000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint whatsapp_quotes_deposit_percent check (
    (payment_type = 'a_cuenta') = (deposit_percent is not null)
  ),
  constraint whatsapp_quotes_contact_needs_client check (contact_id is null or client_id is not null),
  constraint whatsapp_quotes_code_format check (code ~ '^CWA-\d{5,}$'),
  constraint whatsapp_quotes_discard_shape check (
    (status = 'descartada') = (discarded_at is not null)
  )
);

comment on table public.whatsapp_quotes is
  'Cotizaciones de restauración por WhatsApp (P46). No van a Shopify; se copian a restauraciones.';

create table public.whatsapp_quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.whatsapp_quotes (id) on delete cascade,
  number integer not null check (number > 0),
  description text not null check (length(trim(description)) between 1 and 300),
  measure text not null default '' check (length(measure) <= 100),
  material_id uuid references public.materials (id) on delete set null,
  material_name text not null default '' check (length(material_name) <= 100),
  service_id uuid references public.services (id) on delete set null,
  service_name text not null default '' check (length(service_name) <= 100),
  weight_grams numeric(8, 2) check (weight_grams > 0),
  price numeric(12, 2) not null check (price >= 0),
  notes text not null default '' check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint whatsapp_quote_items_number_key unique (quote_id, number),
  constraint whatsapp_quote_items_material_name check (material_id is null or material_name <> ''),
  constraint whatsapp_quote_items_service_name check (service_id is null or service_name <> '')
);

comment on table public.whatsapp_quote_items is
  'Piezas cotizadas por WhatsApp: sin taller, llegada ni fotos (P46).';

create index whatsapp_quotes_client_idx on public.whatsapp_quotes (client_id, created_at desc);
create index whatsapp_quotes_status_idx on public.whatsapp_quotes (status, created_at desc);
create index whatsapp_quotes_created_idx on public.whatsapp_quotes (created_at desc);
create index whatsapp_quote_items_quote_idx on public.whatsapp_quote_items (quote_id, number);
create index whatsapp_quote_items_description_trgm on public.whatsapp_quote_items
  using gin (description extensions.gin_trgm_ops);

-- Origen de la restauración y la pieza cotizada que la originó (P46). No se editan.
alter table public.restorations
  add column origin public.restoration_origin not null default 'oficina',
  add column whatsapp_quote_id uuid references public.whatsapp_quotes (id) on delete restrict;
alter table public.pieces
  add column whatsapp_quote_item_id uuid references public.whatsapp_quote_items (id) on delete restrict;

alter table public.restorations add constraint restorations_origin_quote check (
  (origin = 'whatsapp') = (whatsapp_quote_id is not null)
);

-- Una pieza cotizada se pide una sola vez; si la pieza copiada se anula, se rechaza o
-- queda sin arreglo, vuelve a estar pendiente (supuesto P46 a).
create unique index pieces_whatsapp_quote_item_key on public.pieces (whatsapp_quote_item_id)
  where whatsapp_quote_item_id is not null and status not in ('anulada', 'rechazada', 'sin_arreglo');
create index restorations_whatsapp_quote_idx on public.restorations (whatsapp_quote_id)
  where whatsapp_quote_id is not null;
create index restorations_origin_idx on public.restorations (origin, created_at desc);

create trigger whatsapp_quotes_set_updated_at before update on public.whatsapp_quotes
  for each row execute function private.set_updated_at();
create trigger whatsapp_quote_items_set_updated_at before update on public.whatsapp_quote_items
  for each row execute function private.set_updated_at();

select audit.enable('public.whatsapp_quotes');
select audit.enable('public.whatsapp_quote_items');

-- El contacto debe ser de la empresa de la cotización.
create or replace function private.ensure_whatsapp_quote_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contact_id is not null and not exists (
    select 1 from public.contacts where id = new.contact_id and client_id = new.client_id
  ) then
    raise exception 'El contacto no pertenece al cliente de la cotización'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger whatsapp_quotes_ensure_contact
  before insert or update of client_id, contact_id on public.whatsapp_quotes
  for each row execute function private.ensure_whatsapp_quote_contact();

-- Total = suma de las piezas cotizadas.
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
  set total = coalesce((select sum(i.price) from public.whatsapp_quote_items i where i.quote_id = q.id), 0)
  where q.id = v_quote;
  return null;
end;
$$;

revoke execute on function private.recalculate_whatsapp_quote_total() from public, anon, authenticated;

create trigger whatsapp_quote_items_recalculate_total
  after insert or update of price or delete on public.whatsapp_quote_items
  for each row execute function private.recalculate_whatsapp_quote_total();

-- Estado calculado (descartada se respeta): ninguna pieza pedida → cotizada; algunas
-- → pedida_parcial; todas → pedida. Igual a deriveWhatsappQuoteStatus() de TypeScript.
create or replace function public.derive_whatsapp_quote_status(p_items integer, p_ordered integer)
returns public.whatsapp_quote_status
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_ordered, 0) = 0 then 'cotizada'
    when p_ordered >= p_items then 'pedida'
    else 'pedida_parcial'
  end::public.whatsapp_quote_status;
$$;

revoke execute on function public.derive_whatsapp_quote_status(integer, integer) from public, anon;
grant execute on function public.derive_whatsapp_quote_status(integer, integer) to authenticated, service_role;

-- Piezas cotizadas que ya están pedidas en alguna restauración (pieza viva).
create or replace function private.whatsapp_quote_ordered_count(p_quote_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(distinct i.id)::integer
  from public.whatsapp_quote_items i
  join public.pieces p on p.whatsapp_quote_item_id = i.id
  where i.quote_id = p_quote_id and p.status not in ('anulada', 'rechazada', 'sin_arreglo');
$$;

create or replace function private.refresh_whatsapp_quote_status(p_quote_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.whatsapp_quotes q
  set status = public.derive_whatsapp_quote_status(
    (select count(*)::integer from public.whatsapp_quote_items i where i.quote_id = q.id),
    private.whatsapp_quote_ordered_count(q.id)
  )
  where q.id = p_quote_id and q.status <> 'descartada';
$$;

revoke execute on function private.whatsapp_quote_ordered_count(uuid) from public, anon, authenticated;
revoke execute on function private.refresh_whatsapp_quote_status(uuid) from public, anon, authenticated;

create or replace function private.sync_whatsapp_quote_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.whatsapp_quote_item_id is not null then
    perform private.refresh_whatsapp_quote_status(
      (select i.quote_id from public.whatsapp_quote_items i where i.id = new.whatsapp_quote_item_id)
    );
  end if;
  return null;
end;
$$;

revoke execute on function private.sync_whatsapp_quote_status() from public, anon, authenticated;

create trigger pieces_sync_whatsapp_quote_status
  after insert or update of status on public.pieces
  for each row execute function private.sync_whatsapp_quote_status();

-- Permisos: lectura para admin y ventas; escritura solo por las RPC de abajo.
revoke all on public.whatsapp_quotes, public.whatsapp_quote_items from anon, authenticated;
revoke all on sequence public.whatsapp_quote_code_seq from anon, authenticated;
grant select on public.whatsapp_quotes, public.whatsapp_quote_items to authenticated;

alter table public.whatsapp_quotes enable row level security;
alter table public.whatsapp_quote_items enable row level security;

create policy "Admin y ventas leen las cotizaciones de WhatsApp"
  on public.whatsapp_quotes for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas leen las piezas cotizadas por WhatsApp"
  on public.whatsapp_quote_items for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

-- Validaciones comunes de los datos de la cotización.
create or replace function private.check_whatsapp_quote_input(
  p_client_id uuid,
  p_contact_id uuid,
  p_items jsonb
)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para registrar cotizaciones' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) not between 1 and 100 then
    raise exception 'La cotización debe tener entre 1 y 100 piezas' using errcode = '22023';
  end if;
  if p_client_id is not null and not exists (
    select 1 from public.clients c where c.id = p_client_id and c.active
  ) then
    raise exception 'El cliente no existe o está desactivado' using errcode = '23503';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.contacts k where k.id = p_contact_id and k.active
  ) then
    raise exception 'El contacto no existe o está desactivado' using errcode = '23503';
  end if;
end;
$$;

revoke execute on function private.check_whatsapp_quote_input(uuid, uuid, jsonb) from public, anon;
grant execute on function private.check_whatsapp_quote_input(uuid, uuid, jsonb) to authenticated;

-- Inserta las piezas de la cotización (mismo formato que create_restoration).
create or replace function private.insert_whatsapp_quote_items(p_quote_id uuid, p_items jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_number integer := 0;
begin
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'Pieza inválida' using errcode = '22023';
    end if;
    v_number := v_number + 1;
    insert into public.whatsapp_quote_items (
      quote_id, number, description, measure, material_id, material_name, service_id,
      service_name, weight_grams, price, notes
    ) values (
      p_quote_id,
      v_number,
      trim(coalesce(v_item ->> 'description', '')),
      trim(coalesce(v_item ->> 'measure', '')),
      nullif(v_item ->> 'material_id', '')::uuid,
      trim(coalesce(v_item ->> 'material_name', '')),
      nullif(v_item ->> 'service_id', '')::uuid,
      trim(coalesce(v_item ->> 'service_name', '')),
      nullif(v_item ->> 'weight_grams', '')::numeric,
      (v_item ->> 'price')::numeric,
      coalesce(v_item ->> 'notes', '')
    );
  end loop;
end;
$$;

-- Solo la usan las RPC de abajo (security definer): nadie la llama directamente.
revoke execute on function private.insert_whatsapp_quote_items(uuid, jsonb) from public, anon, authenticated;

-- Registro de una cotización con sus piezas (todo o nada).
create or replace function public.create_whatsapp_quote(
  p_client_id uuid,
  p_contact_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_items jsonb
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb)
  from public, anon;
grant execute on function public.create_whatsapp_quote(uuid, uuid, text, text, public.payment_type, numeric, text, jsonb)
  to authenticated;

-- Edición completa (reemplaza las piezas): solo hasta la primera copia (P46) y si no
-- está descartada.
create or replace function public.update_whatsapp_quote(
  p_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb)
  from public, anon;
grant execute on function public.update_whatsapp_quote(uuid, uuid, uuid, text, text, public.payment_type, numeric, text, jsonb)
  to authenticated;

-- Descartar (con motivo) y reabrir. Una cotización pedida completa no se descarta.
create or replace function public.discard_whatsapp_quote(p_id uuid, p_reason text)
returns public.whatsapp_quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para descartar cotizaciones' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'Escribe el motivo del descarte.' using errcode = '23514';
  end if;
  select * into v_quote from public.whatsapp_quotes q where q.id = p_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status not in ('cotizada', 'pedida_parcial') then
    raise exception 'Esta cotización no se puede descartar.' using errcode = '23514';
  end if;
  update public.whatsapp_quotes q
  set status = 'descartada', discarded_at = now(), discard_reason = v_reason
  where q.id = p_id;
  return 'descartada'::public.whatsapp_quote_status;
end;
$$;

create or replace function public.reopen_whatsapp_quote(p_id uuid)
returns public.whatsapp_quote_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.whatsapp_quotes;
begin
  if not (select private.has_role('{admin,ventas}')) then
    raise exception 'No tienes permiso para reabrir cotizaciones' using errcode = '42501';
  end if;
  select * into v_quote from public.whatsapp_quotes q where q.id = p_id for update;
  if v_quote.id is null then
    raise exception 'La cotización no existe' using errcode = '23503';
  end if;
  if v_quote.status <> 'descartada' then
    raise exception 'La cotización no está descartada.' using errcode = '23514';
  end if;
  update public.whatsapp_quotes q
  set status = public.derive_whatsapp_quote_status(
      (select count(*)::integer from public.whatsapp_quote_items i where i.quote_id = q.id),
      private.whatsapp_quote_ordered_count(q.id)
    ),
    discarded_at = null,
    discard_reason = null
  where q.id = p_id
  returning * into v_quote;
  return v_quote.status;
end;
$$;

revoke execute on function public.discard_whatsapp_quote(uuid, text) from public, anon;
revoke execute on function public.reopen_whatsapp_quote(uuid) from public, anon;
grant execute on function public.discard_whatsapp_quote(uuid, text) to authenticated;
grant execute on function public.reopen_whatsapp_quote(uuid) to authenticated;

-- "Crear restauración" desde la cotización (P46): cliente obligatorio (vincula la
-- cotización si no tenía), piezas pendientes elegidas y/o nuevas; todas entran
-- Aprobadas, lo que encola la orden de Shopify como al aprobar una restauración.
-- p_pieces: como create_restoration más "quote_item_id" opcional por pieza.
create or replace function public.create_restoration_from_whatsapp_quote(
  p_quote_id uuid,
  p_client_id uuid,
  p_contact_id uuid,
  p_payment_type public.payment_type,
  p_deposit_percent numeric,
  p_notes text,
  p_pieces jsonb
)
returns table (id uuid, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.whatsapp_quotes;
  v_restoration public.restorations;
  v_piece jsonb;
  v_item uuid;
  v_seen uuid[] := '{}'::uuid[];
  v_ids uuid[] := '{}'::uuid[];
  v_new uuid;
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
    client_id, contact_id, payment_type, deposit_percent, notes, origin, whatsapp_quote_id
  ) values (
    p_client_id,
    p_contact_id,
    p_payment_type,
    case when p_payment_type = 'a_cuenta' then p_deposit_percent end,
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
      service_id, service_name, weight_grams, price, notes, arrived_at, urgent,
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
      case when coalesce((v_piece ->> 'arrived')::boolean, false) then now() end,
      coalesce((v_piece ->> 'urgent')::boolean, false),
      v_item
    )
    returning pieces.id into v_new;
    v_ids := v_ids || v_new;
  end loop;

  -- El cliente confirmó: las piezas entran Aprobadas (P46, Q2).
  perform public.change_piece_status(v_ids, 'aprobada');

  return query select v_restoration.id, v_restoration.code;
end;
$$;

revoke execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb)
  from public, anon;
grant execute on function public.create_restoration_from_whatsapp_quote(uuid, uuid, uuid, public.payment_type, numeric, text, jsonb)
  to authenticated;

-- Listado de cotizaciones (solo admin y ventas). Busca por código, cliente, contacto,
-- nombre o teléfono anotados y descripción de las piezas cotizadas (P46, Q7).
create or replace function public.list_whatsapp_quotes(
  p_query text default null,
  p_status public.whatsapp_quote_status default null,
  p_client_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  client_id uuid,
  client_name text,
  contact_name text,
  customer_name text,
  customer_phone text,
  status public.whatsapp_quote_status,
  items_count integer,
  pending_count integer,
  total numeric,
  created_at timestamptz,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with filtered as (
    select q.*, c.display_name as client_name, k.display_name as contact_name,
      (select count(*)::integer from public.whatsapp_quote_items i where i.quote_id = q.id) as items_count,
      private.whatsapp_quote_ordered_count(q.id) as ordered_count
    from public.whatsapp_quotes q
    left join public.clients c on c.id = q.client_id
    left join public.contacts k on k.id = q.contact_id
    where (select private.has_role('{admin,ventas}'))
      and (p_status is null or q.status = p_status)
      and (p_client_id is null or q.client_id = p_client_id)
      and (p_from is null or (q.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (q.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or q.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or k.display_name ilike '%' || trim(p_query) || '%'
        or q.customer_name ilike '%' || trim(p_query) || '%'
        or q.customer_phone ilike '%' || trim(p_query) || '%'
        or exists (
          select 1 from public.whatsapp_quote_items i
          where i.quote_id = q.id and i.description ilike '%' || trim(p_query) || '%'
        )
      )
  )
  select f.id, f.code, f.client_id, f.client_name, f.contact_name, f.customer_name, f.customer_phone,
    f.status, f.items_count, f.items_count - f.ordered_count, f.total, f.created_at, count(*) over ()
  from filtered f
  order by f.created_at desc, f.id
  limit least(greatest(p_limit, 1), 500)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer)
  from public, anon;
grant execute on function public.list_whatsapp_quotes(text, public.whatsapp_quote_status, uuid, date, date, integer, integer)
  to authenticated;

-- En qué restauración se pidió cada pieza cotizada (pieza viva; si no, pendiente).
create or replace function public.whatsapp_quote_item_orders(p_quote_id uuid)
returns table (item_id uuid, restoration_id uuid, restoration_code text, piece_code text)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, r.id, r.code, p.code
  from public.whatsapp_quote_items i
  join public.pieces p on p.whatsapp_quote_item_id = i.id
    and p.status not in ('anulada', 'rechazada', 'sin_arreglo')
  join public.restorations r on r.id = p.restoration_id
  where i.quote_id = p_quote_id and (select private.has_role('{admin,ventas}'));
$$;

revoke execute on function public.whatsapp_quote_item_orders(uuid) from public, anon;
grant execute on function public.whatsapp_quote_item_orders(uuid) to authenticated;

-- Listado de restauraciones con filtro y columna de origen (P46, Q14). Reemplaza
-- la versión de 20261005043935_listados.sql.
drop function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer);

create or replace function public.list_restorations(
  p_query text default null,
  p_status public.restoration_status default null,
  p_payment_status public.payment_status default null,
  p_payment_type public.payment_type default null,
  p_client_id uuid default null,
  p_workshop_id uuid default null,
  p_from date default null,
  p_to date default null,
  p_sort text default 'created_at',
  p_dir text default 'desc',
  p_limit integer default 25,
  p_offset integer default 0,
  p_origin public.restoration_origin default null
)
returns table (
  id uuid,
  code text,
  client_id uuid,
  client_name text,
  document_number text,
  contact_name text,
  status public.restoration_status,
  payment_status public.payment_status,
  payment_type public.payment_type,
  pieces_count integer,
  total numeric,
  paid numeric,
  balance numeric,
  created_at timestamptz,
  origin public.restoration_origin,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with role as (
    select private.current_app_role() as r
  ),
  filtered as (
    select r.*, c.display_name as client_name, c.document_number, k.display_name as contact_name,
      (select count(*)::integer from public.pieces p where p.restoration_id = r.id) as pieces_count
    from public.restorations r
    join public.clients c on c.id = r.client_id
    left join public.contacts k on k.id = r.contact_id
    cross join role
    where role.r is not null
      and (role.r in ('admin', 'ventas') or r.status not in ('completada', 'anulada'))
      and (p_status is null or r.status = p_status)
      -- Logística no filtra por dinero (no lo ve).
      and (p_payment_status is null or (role.r in ('admin', 'ventas') and r.payment_status = p_payment_status))
      and (p_payment_type is null or r.payment_type = p_payment_type)
      and (p_client_id is null or r.client_id = p_client_id)
      and (p_origin is null or r.origin = p_origin)
      and (p_workshop_id is null or exists (
        select 1 from public.pieces p where p.restoration_id = r.id and p.workshop_id = p_workshop_id
      ))
      and (p_from is null or (r.created_at at time zone 'America/Lima')::date >= p_from)
      and (p_to is null or (r.created_at at time zone 'America/Lima')::date <= p_to)
      and (
        nullif(trim(p_query), '') is null
        or r.code ilike '%' || trim(p_query) || '%'
        or c.display_name ilike '%' || trim(p_query) || '%'
        or c.document_number ilike '%' || trim(p_query) || '%'
        or k.display_name ilike '%' || trim(p_query) || '%'
      )
  )
  select f.id, f.code, f.client_id, f.client_name, f.document_number, f.contact_name,
    f.status,
    case when role.r in ('admin', 'ventas') then f.payment_status end,
    f.payment_type, f.pieces_count,
    case when role.r in ('admin', 'ventas') then f.total end,
    case when role.r in ('admin', 'ventas') then f.paid end,
    case when role.r in ('admin', 'ventas') then f.balance end,
    f.created_at,
    f.origin,
    count(*) over ()
  from filtered f
  cross join role
  order by
    case when p_dir = 'asc' and p_sort = 'code' then f.code end asc,
    case when p_dir = 'desc' and p_sort = 'code' then f.code end desc,
    case when p_dir = 'asc' and p_sort = 'client' then f.client_name end asc,
    case when p_dir = 'desc' and p_sort = 'client' then f.client_name end desc,
    case when p_dir = 'asc' and p_sort = 'total' and role.r in ('admin', 'ventas') then f.total end asc,
    case when p_dir = 'desc' and p_sort = 'total' and role.r in ('admin', 'ventas') then f.total end desc,
    case when p_dir = 'asc' and p_sort = 'created_at' then f.created_at end asc,
    f.created_at desc,
    f.id
  limit least(greatest(p_limit, 1), 5000)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer, public.restoration_origin) from public, anon;
grant execute on function public.list_restorations(text, public.restoration_status, public.payment_status,
  public.payment_type, uuid, uuid, date, date, text, text, integer, integer, public.restoration_origin) to authenticated;

-- La vista sin dinero lleva el origen (la cotización solo la enlazan admin y ventas).
create or replace view public.restorations_operational
with (security_barrier = true)
as
select r.id, r.code, r.client_id, r.contact_id, r.status, r.payment_type, r.notes,
  r.shopify_order_name, r.created_by, r.created_at, r.updated_at, r.origin, r.whatsapp_quote_id
from public.restorations r
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or r.status not in ('completada', 'anulada')
  );
