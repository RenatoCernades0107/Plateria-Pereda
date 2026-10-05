-- Restauraciones y piezas (Paso 7.1). Los valores de los enums son los de
-- src/domain (piece-state-machine.ts, restoration-status.ts y money.ts).
-- Los montos se guardan en soles con 2 decimales (numeric); la aplicación trabaja en
-- céntimos enteros y convierte al leer y escribir.

create type public.piece_status as enum (
  'registrada', 'en_consulta', 'en_espera', 'aprobada', 'recibida',
  'enviada_taller', 'devuelta_taller', 'observada', 'entregada', 'anulada'
);
create type public.restoration_status as enum (
  'registrada', 'aprobada', 'en_proceso', 'parcialmente_lista', 'lista', 'completada', 'anulada'
);
create type public.piece_location as enum (
  'por_recibir', 'en_tienda', 'en_taller', 'entregada', 'anulada'
);
-- P29 (pendiente) con su propuesta.
create type public.payment_status as enum ('pendiente', 'parcial', 'pagado', 'reembolsado');
create type public.payment_type as enum ('contado', 'a_cuenta', 'credito');

-- Códigos correlativos: RES-00001 (crece a más dígitos pasado el 99999).
create sequence public.restoration_code_seq;

create or replace function private.next_restoration_code()
returns text
language sql
volatile
security definer
set search_path = ''
as $$
  select 'RES-' || lpad(n::text, greatest(5, length(n::text)), '0')
  from (select nextval('public.restoration_code_seq') as n) s;
$$;

revoke execute on function private.next_restoration_code() from public, anon;
grant execute on function private.next_restoration_code() to authenticated;

create table public.restorations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_restoration_code(),
  client_id uuid not null references public.clients (id) on delete restrict,
  contact_id uuid references public.contacts (id) on delete restrict,
  status public.restoration_status not null default 'registrada',
  payment_type public.payment_type not null,
  -- Solo en "A cuenta" (50 % por defecto, lo propone la aplicación).
  deposit_percent numeric(5, 2) check (deposit_percent between 1 and 100),
  total numeric(12, 2) not null default 0 check (total >= 0),
  paid numeric(12, 2) not null default 0,
  -- Adelanto esperado: % del total en "A cuenta", todo en "Contado", nada en "Crédito".
  -- round() de numeric redondea los empates lejos del cero, igual que money.ts.
  expected_deposit numeric(12, 2) generated always as (
    case payment_type
      when 'a_cuenta' then round(total * deposit_percent / 100, 2)
      when 'contado' then total
      else 0
    end
  ) stored,
  balance numeric(12, 2) generated always as (total - paid) stored,
  payment_status public.payment_status not null default 'pendiente',
  notes text not null default '' check (length(notes) <= 2000),
  shopify_order_id text unique,
  shopify_order_name text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint restorations_deposit_percent check (
    (payment_type = 'a_cuenta') = (deposit_percent is not null)
  ),
  constraint restorations_code_format check (code ~ '^RES-\d{5,}$')
);

comment on table public.restorations is
  'Restauraciones: un cliente deja una o más piezas. Total = suma de piezas no anuladas.';

create table public.pieces (
  id uuid primary key default gen_random_uuid(),
  restoration_id uuid not null references public.restorations (id) on delete restrict,
  -- Número dentro de la restauración y código (RES-00001-1); los fija un trigger.
  number integer not null check (number > 0),
  code text not null unique,
  status public.piece_status not null default 'registrada',
  workshop_id uuid references public.workshops (id) on delete restrict,
  description text not null check (length(trim(description)) between 1 and 300),
  measure text not null default '' check (length(measure) <= 100),
  -- Material y servicio del catálogo (id + nombre) o escritos libremente (solo nombre), P22.
  material_id uuid references public.materials (id) on delete set null,
  material_name text not null default '' check (length(material_name) <= 100),
  service_id uuid references public.services (id) on delete set null,
  service_name text not null default '' check (length(service_name) <= 100),
  weight_grams numeric(8, 2) check (weight_grams > 0),
  price numeric(12, 2) not null check (price >= 0),
  notes text not null default '' check (length(notes) <= 1000),
  -- Llegada física a la tienda y fechas de cada hito (§7.4).
  arrived_at timestamptz,
  approved_at timestamptz,
  received_at timestamptz,
  first_sent_at timestamptz,
  last_returned_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  -- Ubicación física (§7.2), igual que deriveLocation() de restoration-status.ts.
  location public.piece_location generated always as (
    case
      when status = 'anulada' then 'anulada'::public.piece_location
      when status = 'entregada' then 'entregada'::public.piece_location
      when status = 'enviada_taller' then 'en_taller'::public.piece_location
      when arrived_at is not null then 'en_tienda'::public.piece_location
      else 'por_recibir'::public.piece_location
    end
  ) stored,
  shopify_line_item_id text,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint pieces_number_key unique (restoration_id, number),
  constraint pieces_material_name check (material_id is null or material_name <> ''),
  constraint pieces_service_name check (service_id is null or service_name <> '')
);

comment on table public.pieces is
  'Piezas de una restauración, con su estado, ubicación, taller y precio.';

create index restorations_client_idx on public.restorations (client_id);
create index restorations_status_idx on public.restorations (status, created_at desc);
create index restorations_created_idx on public.restorations (created_at desc);
create index restorations_code_trgm on public.restorations
  using gin (code extensions.gin_trgm_ops);
create index pieces_restoration_idx on public.pieces (restoration_id, number);
create index pieces_status_idx on public.pieces (status);
create index pieces_workshop_idx on public.pieces (workshop_id) where workshop_id is not null;

-- El contacto debe ser de la empresa de la restauración.
create or replace function private.ensure_restoration_contact()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.contact_id is not null and not exists (
    select 1 from public.contacts where id = new.contact_id and client_id = new.client_id
  ) then
    raise exception 'El contacto no pertenece al cliente de la restauración'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger restorations_ensure_contact
  before insert or update of client_id, contact_id on public.restorations
  for each row execute function private.ensure_restoration_contact();

-- Número y código de la pieza. Bloquea la restauración para que dos piezas agregadas a
-- la vez no reciban el mismo número.
create or replace function private.set_piece_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  select code into v_code from public.restorations where id = new.restoration_id for update;
  if v_code is null then
    raise exception 'La restauración no existe' using errcode = '23503';
  end if;
  select coalesce(max(number), 0) + 1 into new.number
  from public.pieces where restoration_id = new.restoration_id;
  new.code := v_code || '-' || new.number;
  return new;
end;
$$;

revoke execute on function private.set_piece_code() from public, anon, authenticated;

create trigger pieces_set_code
  before insert on public.pieces
  for each row execute function private.set_piece_code();

-- Ni la pieza cambia de restauración ni cambian los códigos.
create or replace function private.prevent_piece_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.restoration_id <> old.restoration_id or new.number <> old.number or new.code <> old.code then
    raise exception 'No se puede cambiar la restauración ni el código de una pieza'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger pieces_prevent_identity_change
  before update of restoration_id, number, code on public.pieces
  for each row execute function private.prevent_piece_identity_change();

create or replace function private.prevent_restoration_code_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code <> old.code then
    raise exception 'No se puede cambiar el código de una restauración' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger restorations_prevent_code_change
  before update of code on public.restorations
  for each row execute function private.prevent_restoration_code_change();

-- Total de la restauración = suma de los precios de sus piezas no anuladas.
create or replace function private.recalculate_restoration_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.restorations r
  set total = coalesce((
    select sum(p.price) from public.pieces p
    where p.restoration_id = r.id and p.status <> 'anulada'
  ), 0)
  where r.id in (new.restoration_id);
  return null;
end;
$$;

revoke execute on function private.recalculate_restoration_total() from public, anon, authenticated;

create trigger pieces_recalculate_total
  after insert or update of price, status on public.pieces
  for each row execute function private.recalculate_restoration_total();

create trigger restorations_set_updated_at before update on public.restorations
  for each row execute function private.set_updated_at();
create trigger pieces_set_updated_at before update on public.pieces
  for each row execute function private.set_updated_at();

select audit.enable('public.restorations', '{expected_deposit,balance}');
select audit.enable('public.pieces', '{location}');

revoke all on public.restorations, public.pieces from anon, authenticated;
revoke all on sequence public.restoration_code_seq from anon, authenticated;
grant select on public.restorations, public.pieces to authenticated;
-- Lo que calcula el sistema (estado, totales, pagos, fechas de hitos, ids de Shopify)
-- no se escribe directamente: lo fijan triggers y RPC. El cliente no cambia (P12).
grant insert (client_id, contact_id, payment_type, deposit_percent, notes)
  on public.restorations to authenticated;
grant update (contact_id, payment_type, deposit_percent, notes)
  on public.restorations to authenticated;
grant insert (restoration_id, workshop_id, description, measure, material_id, material_name,
    service_id, service_name, weight_grams, price, notes, arrived_at)
  on public.pieces to authenticated;
grant update (workshop_id, description, measure, material_id, material_name, service_id,
    service_name, weight_grams, price, notes)
  on public.pieces to authenticated;

alter table public.restorations enable row level security;
alter table public.pieces enable row level security;

-- Las tablas tienen precios y montos: solo admin y ventas las leen directamente.
-- Logística usa las vistas *_operational, sin dinero (P42).
create policy "Admin y ventas leen las restauraciones"
  on public.restorations for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas registran restauraciones"
  on public.restorations for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan restauraciones"
  on public.restorations for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas leen las piezas"
  on public.pieces for select to authenticated
  using ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas registran piezas"
  on public.pieces for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan piezas"
  on public.pieces for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));

-- Vistas sin dinero para todos los roles activos. Logística no ve restauraciones
-- pasadas (completadas o anuladas, D24). Las vistas corren con los permisos de su
-- dueño, así que el filtro por rol va en el WHERE.
create view public.restorations_operational
with (security_barrier = true)
as
select r.id, r.code, r.client_id, r.contact_id, r.status, r.payment_type, r.notes,
  r.shopify_order_name, r.created_by, r.created_at, r.updated_at
from public.restorations r
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or r.status not in ('completada', 'anulada')
  );

create view public.pieces_operational
with (security_barrier = true)
as
select p.id, p.restoration_id, p.number, p.code, p.status, p.workshop_id, p.description,
  p.measure, p.material_id, p.material_name, p.service_id, p.service_name, p.weight_grams,
  p.notes, p.arrived_at, p.approved_at, p.received_at, p.first_sent_at, p.last_returned_at,
  p.delivered_at, p.cancelled_at, p.location, p.created_at, p.updated_at
from public.pieces p
join public.restorations r on r.id = p.restoration_id
where (select private.current_app_role()) is not null
  and (
    (select private.has_role('{admin,ventas}'))
    or r.status not in ('completada', 'anulada')
  );

comment on view public.restorations_operational is
  'Restauraciones sin montos (P42). Logística no ve las completadas ni anuladas (D24).';
comment on view public.pieces_operational is
  'Piezas sin precio (P42). Logística no ve las de restauraciones pasadas (D24).';

revoke all on public.restorations_operational, public.pieces_operational from anon, authenticated;
grant select on public.restorations_operational, public.pieces_operational to authenticated;
