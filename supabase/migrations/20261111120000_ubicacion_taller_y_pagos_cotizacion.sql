-- Cotizaciones (`COT-`, pedido del 2026-11-11):
--   1. Se quita «Reembolsada» (no hace falta): ya no se puede pasar a ella. El valor del
--      enum y las cotizaciones que ya estén así se dejan como están (estado final legado).
--   2. Ubicación del trabajo (`work_location`: En taller, En tienda o Entregado) y taller
--      asignado (`workshop_id`). Solo existen en las aceptadas y facturadas (y en las
--      reembolsadas de antes); al salir de esos estados se borran, como las fechas de
--      entrega. Se escriben por `update_quote_tracking` (no hay permiso de columna): el
--      taller lo asignan logística y el admin (D60), la ubicación también ventas.
--   3. Logística sigue sin leer `quotes` (tiene totales y datos del cliente): hace el
--      seguimiento de las aprobadas por RPC, sin dinero ni teléfonos.
--   4. Pagos de cotización (`quote_payments`): solo en aceptadas o facturadas, sin Shopify,
--      con N.º de factura opcional por pago. Admin y ventas los registran y asignan la
--      factura; el admin elimina uno registrado por error.

create type public.quote_work_location as enum ('en_taller', 'en_tienda', 'entregado');

alter table public.quotes
  add column work_location public.quote_work_location,
  add column workshop_id uuid references public.workshops (id) on delete set null;

comment on column public.quotes.work_location is
  'Dónde está el trabajo (En taller, En tienda, Entregado); solo en aceptadas y facturadas.';
comment on column public.quotes.workshop_id is
  'Taller asignado a la cotización aprobada (lo asignan logística y el admin).';

create index quotes_workshop_idx on public.quotes (workshop_id) where workshop_id is not null;

-- 1. Reglas de la cotización (resto como 20261105130100).
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
      or (old.status = 'aceptada' and new.status = 'facturada')
    ) then
      raise exception 'No se puede pasar una cotización de % a %', old.status, new.status
        using errcode = '23514';
    end if;
    -- Con pagos registrados no deja de estar aceptada o facturada.
    if old.status in ('aceptada', 'facturada') and new.status not in ('aceptada', 'facturada')
       and exists (select 1 from public.quote_payments where quote_id = old.id) then
      raise exception 'La cotización tiene pagos registrados: elimínalos antes de cambiar su estado'
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

  -- Una reembolsada (de antes) ya no cambia sus fechas de entrega.
  if old.status = 'reembolsada' and (
    new.delivery_date is distinct from old.delivery_date
    or new.supplier_delivery_date is distinct from old.supplier_delivery_date
  ) then
    raise exception 'Una cotización reembolsada no cambia sus fechas de entrega'
      using errcode = '23514';
  end if;

  -- Fechas de entrega, ubicación y taller: solo en las aceptadas, facturadas y (de
  -- antes) reembolsadas.
  if new.status not in ('aceptada', 'facturada', 'reembolsada') then
    new.delivery_date := null;
    new.supplier_delivery_date := null;
    new.work_location := null;
    new.workshop_id := null;
    return new;
  end if;

  -- Obligatoria al aceptarla (o si se intenta borrar); las aceptadas de antes pueden
  -- seguir sin fecha hasta que se les coloque.
  if new.delivery_date is null
     and (old.status not in ('aceptada', 'facturada', 'reembolsada')
          or old.delivery_date is not null) then
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

-- 2. Seguimiento de la cotización aprobada: ubicación del trabajo y taller. Con
--    `p_set_*` en false no se toca el campo (así se cambia uno solo); con true y null se
--    borra. Escribe por la tabla, así que los guards y la auditoría siguen aplicando.
create function public.update_quote_tracking(
  p_id uuid,
  p_set_workshop boolean default false,
  p_workshop_id uuid default null,
  p_set_location boolean default false,
  p_work_location public.quote_work_location default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.quote_status;
begin
  if not (select private.has_role('{admin,ventas,logistica}')) then
    raise exception 'Tu rol no puede cambiar el seguimiento de la cotización.'
      using errcode = '42501';
  end if;
  if p_set_workshop and not (select private.has_role('{admin,logistica}')) then
    raise exception 'Solo logística y el administrador asignan el taller.'
      using errcode = '42501';
  end if;
  if p_set_workshop and p_workshop_id is not null and not exists (
    select 1 from public.workshops w where w.id = p_workshop_id and w.active
  ) then
    raise exception 'El taller no existe o está desactivado.' using errcode = '23503';
  end if;

  select status into v_status from public.quotes where id = p_id for update;
  if v_status is null then
    raise exception 'La cotización no existe' using errcode = 'P0002';
  end if;
  if v_status not in ('aceptada', 'facturada') then
    raise exception 'Solo una cotización aceptada o facturada tiene taller y ubicación'
      using errcode = '23514';
  end if;

  update public.quotes q set
    workshop_id = case when p_set_workshop then p_workshop_id else q.workshop_id end,
    work_location = case when p_set_location then p_work_location else q.work_location end
  where q.id = p_id;
end;
$$;

revoke execute on function public.update_quote_tracking(uuid, boolean, uuid, boolean,
  public.quote_work_location) from public, anon;
grant execute on function public.update_quote_tracking(uuid, boolean, uuid, boolean,
  public.quote_work_location) to authenticated;

-- 3. Logística: cotizaciones aprobadas sin dinero ni datos de contacto del cliente.
create function public.list_logistics_quotes(
  p_query text default null,
  p_status public.quote_status default null,
  p_workshop_id uuid default null,
  p_location public.quote_work_location default null,
  p_without_workshop boolean default false,
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  code text,
  status public.quote_status,
  client_name text,
  delivery_date date,
  supplier_delivery_date date,
  work_location public.quote_work_location,
  workshop_id uuid,
  workshop_name text,
  items_count integer,
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.code, q.status, q.client_name, q.delivery_date, q.supplier_delivery_date,
    q.work_location, q.workshop_id, w.name,
    (select count(*)::integer from public.quote_items i where i.quote_id = q.id),
    count(*) over ()
  from public.quotes q
  left join public.workshops w on w.id = q.workshop_id
  where (select private.has_role('{admin,ventas,logistica}'))
    and q.status in ('aceptada', 'facturada')
    and (p_status is null or q.status = p_status)
    and (p_workshop_id is null or q.workshop_id = p_workshop_id)
    and (not coalesce(p_without_workshop, false) or q.workshop_id is null)
    and (p_location is null or q.work_location = p_location)
    and (
      nullif(trim(p_query), '') is null
      or q.code ilike '%' || trim(p_query) || '%'
      or q.client_name ilike '%' || trim(p_query) || '%'
    )
  order by q.delivery_date nulls last, q.number desc
  limit least(greatest(p_limit, 1), 200)
  offset greatest(p_offset, 0);
$$;

revoke execute on function public.list_logistics_quotes(text, public.quote_status, uuid,
  public.quote_work_location, boolean, integer, integer) from public, anon;
grant execute on function public.list_logistics_quotes(text, public.quote_status, uuid,
  public.quote_work_location, boolean, integer, integer) to authenticated;

-- Una cotización aprobada con sus productos (sin precios). Null si no existe o no está
-- aceptada ni facturada.
create function public.get_logistics_quote(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'code', q.code,
    'status', q.status,
    'client_name', q.client_name,
    'issue_date', q.issue_date,
    'delivery_date', q.delivery_date,
    'supplier_delivery_date', q.supplier_delivery_date,
    'workshop_notes', q.workshop_notes,
    'work_location', q.work_location,
    'workshop_id', q.workshop_id,
    'workshop_name', w.name,
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'title', i.title, 'variant_title', i.variant_title, 'sku', i.sku,
        'customization', i.customization, 'quantity', i.quantity,
        'image_url', i.image_url, 'reference_image_path', i.reference_image_path
      ) order by i.position)
      from public.quote_items i where i.quote_id = q.id
    ), '[]'::jsonb)
  )
  from public.quotes q
  left join public.workshops w on w.id = q.workshop_id
  where q.id = p_id
    and q.status in ('aceptada', 'facturada')
    and (select private.has_role('{admin,ventas,logistica}'));
$$;

revoke execute on function public.get_logistics_quote(uuid) from public, anon;
grant execute on function public.get_logistics_quote(uuid) to authenticated;

-- Las fotos referenciales de los productos: logística también las ve.
create policy "Logística ve las fotos de las cotizaciones"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'quote-images' and (select private.has_role('{logistica}')));

-- 4. Pagos de la cotización.
create table public.quote_payments (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes (id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  -- Nombre del método al registrarlo.
  method_name text not null check (length(trim(method_name)) between 1 and 100),
  paid_on date not null default (now() at time zone 'America/Lima')::date,
  -- Factura (boleta u otro comprobante) que respalda este pago.
  invoice_number text check (invoice_number is null or length(trim(invoice_number)) between 1 and 30),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now()
);

comment on table public.quote_payments is
  'Pagos de una cotización aceptada o facturada (sin Shopify), con el N.º de factura de cada uno.';

create index quote_payments_quote_idx on public.quote_payments (quote_id, created_at);

-- Valida el pago: la cotización aceptada o facturada, que no pase del saldo y el método.
create or replace function private.prepare_quote_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.quote_status;
  v_total numeric;
  v_paid numeric;
  v_method text;
begin
  select status, total into v_status, v_total
  from public.quotes where id = new.quote_id for update;
  if v_status is null or v_status not in ('aceptada', 'facturada') then
    raise exception 'Solo una cotización aceptada o facturada recibe pagos'
      using errcode = '23514';
  end if;

  select coalesce(sum(amount), 0) into v_paid
  from public.quote_payments where quote_id = new.quote_id;
  if new.amount > v_total - v_paid then
    raise exception 'El monto supera el saldo pendiente' using errcode = '23514';
  end if;

  if new.payment_method_id is not null then
    select name into v_method from public.payment_methods where id = new.payment_method_id;
    new.method_name := v_method;
  end if;
  new.invoice_number := nullif(trim(new.invoice_number), '');
  new.created_by := auth.uid();
  new.created_by_name := (select full_name from public.profiles where id = auth.uid());
  new.created_at := now();
  return new;
end;
$$;

revoke execute on function private.prepare_quote_payment() from public, anon, authenticated;

create trigger quote_payments_prepare
  before insert on public.quote_payments
  for each row execute function private.prepare_quote_payment();

-- Después de registrado, un pago solo cambia su N.º de factura.
create or replace function private.quote_payment_guard_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.quote_id, new.amount, new.payment_method_id, new.method_name,
      new.paid_on, new.created_by, new.created_by_name, new.created_at)
     is distinct from
     (old.id, old.quote_id, old.amount, old.payment_method_id, old.method_name,
      old.paid_on, old.created_by, old.created_by_name, old.created_at) then
    raise exception 'Un pago registrado solo cambia su número de factura'
      using errcode = '23514';
  end if;
  new.invoice_number := nullif(trim(new.invoice_number), '');
  return new;
end;
$$;

create trigger quote_payments_guard_update
  before update on public.quote_payments
  for each row execute function private.quote_payment_guard_update();

alter table public.quote_payments enable row level security;

create policy "Admin y ventas leen los pagos de las cotizaciones"
  on public.quote_payments for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas registran pagos de cotizaciones"
  on public.quote_payments for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas asignan el número de factura"
  on public.quote_payments for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));

create policy "Solo el admin elimina un pago de cotización"
  on public.quote_payments for delete to authenticated
  using ((select private.has_role('{admin}')));

revoke all on public.quote_payments from anon, authenticated;
grant select, delete on public.quote_payments to authenticated;
grant insert (quote_id, amount, payment_method_id, method_name, paid_on, invoice_number)
  on public.quote_payments to authenticated;
grant update (invoice_number) on public.quote_payments to authenticated;

select audit.enable('public.quote_payments');
