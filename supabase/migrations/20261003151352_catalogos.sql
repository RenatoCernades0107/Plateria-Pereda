-- Catálogos que se proponen al registrar restauraciones y pagos (P22, N1).
-- En las piezas se puede elegir de la lista o escribir libremente; los ítems no se borran,
-- se desactivan. Solo admin los gestiona.

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.materials is 'Materiales de las piezas (plata 950, oro 18k, …).';

create table public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  -- Precio que se propone al cotizar; se puede cambiar en cada pieza.
  suggested_price numeric(10, 2) check (suggested_price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.services is 'Servicios de restauración (limpieza, soldadura, baño de plata, …).';

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.payment_methods is 'Métodos de pago que se registran en el sistema y se envían a Shopify.';

create unique index materials_name_key on public.materials (lower(trim(name)));
create unique index services_name_key on public.services (lower(trim(name)));
create unique index payment_methods_name_key on public.payment_methods (lower(trim(name)));

create trigger materials_set_updated_at before update on public.materials
  for each row execute function private.set_updated_at();
create trigger services_set_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger payment_methods_set_updated_at before update on public.payment_methods
  for each row execute function private.set_updated_at();

insert into public.payment_methods (name) values ('Efectivo'), ('Tarjeta'), ('Yape'), ('Plin');

select audit.enable('public.materials');
select audit.enable('public.services');
select audit.enable('public.payment_methods');

revoke all on public.materials, public.services, public.payment_methods from anon, authenticated;
grant select, insert, update on public.materials, public.services, public.payment_methods to authenticated;

alter table public.materials enable row level security;
alter table public.services enable row level security;
alter table public.payment_methods enable row level security;

-- Lectura: los materiales los ve todo el equipo; servicios (tienen precios) y métodos de
-- pago solo admin y ventas, porque logística no ve dinero (P42).
create policy "Los usuarios leen los materiales"
  on public.materials for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy "Admin y ventas leen los servicios"
  on public.services for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas leen los métodos de pago"
  on public.payment_methods for select to authenticated
  using ((select private.has_role('{admin,ventas}')));

create policy "Solo admin crea materiales"
  on public.materials for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "Solo admin edita materiales"
  on public.materials for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));

create policy "Solo admin crea servicios"
  on public.services for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "Solo admin edita servicios"
  on public.services for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));

create policy "Solo admin crea métodos de pago"
  on public.payment_methods for insert to authenticated
  with check ((select private.has_role('{admin}')));
create policy "Solo admin edita métodos de pago"
  on public.payment_methods for update to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));
