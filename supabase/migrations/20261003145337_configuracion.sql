-- Configuración de la empresa (una sola fila) y bucket público para el logo.

create table public.settings (
  -- Siempre true: garantiza que exista una sola fila.
  id boolean primary key default true check (id),
  legal_name text not null default '' check (length(legal_name) <= 200),
  ruc text check (ruc ~ '^\d{11}$'),
  address text not null default '' check (length(address) <= 300),
  phones text not null default '' check (length(phones) <= 200),
  email text not null default '' check (length(email) <= 200),
  -- Ruta del logo en el bucket "branding".
  logo_path text,
  quote_validity_days integer not null default 15 check (quote_validity_days between 1 and 365),
  terms text not null default '' check (length(terms) <= 5000),
  -- Vacío = la plantilla por defecto de la aplicación (DEFAULT_WHATSAPP_TEMPLATE).
  whatsapp_template text check (length(whatsapp_template) <= 4000),
  deposit_percent numeric(5, 2) not null default 50 check (deposit_percent between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.settings is
  'Datos de la empresa y valores por defecto (vigencia de cotizaciones, adelanto, plantilla de WhatsApp).';

insert into public.settings (legal_name) values ('Platería Pereda');

create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function private.set_updated_at();

select audit.enable('public.settings');

revoke all on public.settings from anon, authenticated;
grant select, update on public.settings to authenticated;

alter table public.settings enable row level security;

create policy "Los usuarios leen la configuración"
  on public.settings for select
  to authenticated
  using (true);

create policy "Solo admin edita la configuración"
  on public.settings for update
  to authenticated
  using ((select private.has_role('{admin}')))
  with check ((select private.has_role('{admin}')));

-- Logo: lectura pública (se usa en los PDF); solo admin sube, cambia o borra.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']);

create policy "Solo admin sube archivos de marca"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'branding' and (select private.has_role('{admin}')));

create policy "Solo admin cambia archivos de marca"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'branding' and (select private.has_role('{admin}')))
  with check (bucket_id = 'branding' and (select private.has_role('{admin}')));

create policy "Solo admin borra archivos de marca"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'branding' and (select private.has_role('{admin}')));
