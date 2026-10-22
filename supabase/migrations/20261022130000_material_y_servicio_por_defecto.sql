-- Material y servicio por defecto (pedido del 2026-10-22): el admin marca en
-- Configuración un material y un servicio que se proponen ya elegidos en cada pieza
-- nueva (se pueden quitar o cambiar en la pieza). A lo sumo uno por catálogo, y debe
-- estar activo: al desactivarlo deja de ser el de por defecto (lo hace la aplicación).

alter table public.materials
  add column is_default boolean not null default false,
  add constraint materials_default_active check (not is_default or active);
alter table public.services
  add column is_default boolean not null default false,
  add constraint services_default_active check (not is_default or active);

comment on column public.materials.is_default is
  'Se propone ya elegido en cada pieza nueva. A lo sumo uno, y activo.';
comment on column public.services.is_default is
  'Se propone ya elegido en cada pieza nueva. A lo sumo uno, y activo.';

create unique index materials_one_default on public.materials (is_default) where is_default;
create unique index services_one_default on public.services (is_default) where is_default;
