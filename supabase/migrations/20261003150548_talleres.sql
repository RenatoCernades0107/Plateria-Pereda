-- Talleres externos donde se restauran las piezas.
-- No se borran: se desactivan, para conservar el historial de las piezas que pasaron por ellos.

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 100),
  contact_name text not null default '' check (length(contact_name) <= 100),
  phone text not null default '' check (length(phone) <= 30),
  address text not null default '' check (length(address) <= 300),
  notes text not null default '' check (length(notes) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.workshops is 'Talleres externos. Los inactivos no se asignan a piezas nuevas.';

create unique index workshops_name_key on public.workshops (lower(trim(name)));

create trigger workshops_set_updated_at
  before update on public.workshops
  for each row execute function private.set_updated_at();

select audit.enable('public.workshops');

revoke all on public.workshops from anon, authenticated;
grant select, insert, update on public.workshops to authenticated;

alter table public.workshops enable row level security;

-- Ventas también los lee: asigna el taller al aprobar una pieza.
create policy "Los usuarios leen los talleres"
  on public.workshops for select
  to authenticated
  using ((select private.current_app_role()) is not null);

create policy "Admin y logística crean talleres"
  on public.workshops for insert
  to authenticated
  with check ((select private.has_role('{admin,logistica}')));

create policy "Admin y logística editan talleres"
  on public.workshops for update
  to authenticated
  using ((select private.has_role('{admin,logistica}')))
  with check ((select private.has_role('{admin,logistica}')));
