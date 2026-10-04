-- Clientes (personas y empresas) y contactos de las empresas.
-- En Shopify (P14 = b): una persona es un Customer; una empresa es una Company con su
-- ubicación; cada contacto es un Customer asociado a la Company como CompanyContact.
-- Los datos obligatorios del formulario (P27) se validan en la aplicación; aquí solo
-- se garantiza la integridad. No se borran: se desactivan.

create type public.client_kind as enum ('persona', 'empresa');
create type public.document_type as enum ('dni', 'ce', 'pasaporte', 'ruc');

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  kind public.client_kind not null,
  first_name text not null default '' check (length(first_name) <= 100),
  last_name text not null default '' check (length(last_name) <= 100),
  legal_name text not null default '' check (length(legal_name) <= 200),
  -- Nombre para mostrar y buscar: nombres y apellidos, o razón social.
  display_name text generated always as (
    case when kind = 'empresa' then legal_name
         else trim(first_name || ' ' || last_name) end
  ) stored,
  document_type public.document_type,
  document_number text,
  -- E.164 (+51999888777), como lo usa Shopify.
  phone text check (phone ~ '^\+[1-9]\d{6,14}$'),
  email text check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  address text not null default '' check (length(address) <= 300),
  notes text not null default '' check (length(notes) <= 2000),
  active boolean not null default true,
  shopify_customer_id text unique,
  shopify_company_id text unique,
  shopify_company_location_id text unique,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_document_pair check ((document_type is null) = (document_number is null)),
  -- Persona: nombres; nunca RUC ni ids de Company. Empresa: razón social y RUC.
  constraint clients_persona_shape check (
    kind <> 'persona' or (
      first_name <> '' and document_type is distinct from 'ruc'
      and shopify_company_id is null and shopify_company_location_id is null
    )
  ),
  constraint clients_empresa_shape check (
    kind <> 'empresa' or (
      legal_name <> '' and document_type is not distinct from 'ruc' and shopify_customer_id is null
    )
  )
);

comment on table public.clients is
  'Clientes: personas (Customer de Shopify) y empresas (Company de Shopify, P14).';

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null default '' check (length(last_name) <= 100),
  display_name text generated always as (trim(first_name || ' ' || last_name)) stored,
  position text not null default '' check (length(position) <= 100),
  document_type public.document_type check (document_type is distinct from 'ruc'),
  document_number text,
  phone text check (phone ~ '^\+[1-9]\d{6,14}$'),
  email text check (email = lower(email) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  active boolean not null default true,
  shopify_customer_id text unique,
  shopify_company_contact_id text unique,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contacts_document_pair check ((document_type is null) = (document_number is null))
);

comment on table public.contacts is
  'Contactos de una empresa (Customer + CompanyContact en Shopify).';

-- Un documento identifica a una sola persona o empresa.
create unique index clients_document_key on public.clients (document_type, document_number)
  where document_number is not null;
create unique index contacts_document_key on public.contacts (document_type, document_number)
  where document_number is not null;

create index contacts_client_idx on public.contacts (client_id);

-- Búsqueda por similitud (nombre, documento, teléfono, email).
create index clients_display_name_trgm on public.clients
  using gin (display_name extensions.gin_trgm_ops);
create index clients_document_trgm on public.clients
  using gin (document_number extensions.gin_trgm_ops);
create index clients_phone_trgm on public.clients using gin (phone extensions.gin_trgm_ops);
create index clients_email_trgm on public.clients using gin (email extensions.gin_trgm_ops);
create index contacts_display_name_trgm on public.contacts
  using gin (display_name extensions.gin_trgm_ops);
create index contacts_phone_trgm on public.contacts using gin (phone extensions.gin_trgm_ops);
create index contacts_email_trgm on public.contacts using gin (email extensions.gin_trgm_ops);

-- Un contacto solo puede pertenecer a una empresa.
create or replace function private.ensure_contact_company()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.clients where id = new.client_id and kind = 'empresa'
  ) then
    raise exception 'Un contacto solo puede pertenecer a una empresa'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger contacts_ensure_company
  before insert or update of client_id on public.contacts
  for each row execute function private.ensure_contact_company();

-- Un cliente no cambia de tipo: los ids de Shopify dependen de él.
create or replace function private.prevent_client_kind_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind <> old.kind then
    raise exception 'No se puede cambiar el tipo de cliente' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger clients_prevent_kind_change
  before update of kind on public.clients
  for each row execute function private.prevent_client_kind_change();

create trigger clients_set_updated_at before update on public.clients
  for each row execute function private.set_updated_at();
create trigger contacts_set_updated_at before update on public.contacts
  for each row execute function private.set_updated_at();

select audit.enable('public.clients', '{display_name}');
select audit.enable('public.contacts', '{display_name}');

revoke all on public.clients, public.contacts from anon, authenticated;
grant select, insert, update on public.clients, public.contacts to authenticated;

alter table public.clients enable row level security;
alter table public.contacts enable row level security;

-- Todos los usuarios activos leen (logística ve los datos de contacto, P42).
create policy "Los usuarios leen los clientes"
  on public.clients for select to authenticated
  using ((select private.current_app_role()) is not null);
create policy "Los usuarios leen los contactos"
  on public.contacts for select to authenticated
  using ((select private.current_app_role()) is not null);

create policy "Admin y ventas crean clientes"
  on public.clients for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan clientes"
  on public.clients for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));

create policy "Admin y ventas crean contactos"
  on public.contacts for insert to authenticated
  with check ((select private.has_role('{admin,ventas}')));
create policy "Admin y ventas editan contactos"
  on public.contacts for update to authenticated
  using ((select private.has_role('{admin,ventas}')))
  with check ((select private.has_role('{admin,ventas}')));
