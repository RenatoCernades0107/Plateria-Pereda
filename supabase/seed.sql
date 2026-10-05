-- Datos de prueba para el entorno local (se cargan con `pnpm db:reset`). Nunca se aplican en producción.

-- Un usuario por rol. Contraseña de todos: Pereda-local-2026
with semillas (id, email, rol, nombre) as (
  values
    ('10000000-0000-0000-0000-000000000001'::uuid, 'admin@pereda.test', 'admin', 'Admin de prueba'),
    ('10000000-0000-0000-0000-000000000002'::uuid, 'ventas@pereda.test', 'ventas', 'Ventas de prueba'),
    ('10000000-0000-0000-0000-000000000003'::uuid, 'logistica@pereda.test', 'logistica', 'Logística de prueba')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select
  '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', email,
  extensions.crypt('Pereda-local-2026', extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'role', rol),
  jsonb_build_object('full_name', nombre), now(), now(),
  '', '', '', '', '', '', '', ''
from semillas;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  gen_random_uuid(), id, id::text,
  jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users
where email like '%@pereda.test';

-- Datos de ejemplo (catálogos, talleres, clientes y restauraciones). Los ids son fijos y los
-- inserts ignoran duplicados, así que esta parte se puede volver a ejecutar sin errores.
insert into public.materials (id, name) values
  ('20000000-0000-0000-0000-000000000001', 'Plata 950'),
  ('20000000-0000-0000-0000-000000000002', 'Oro 18k'),
  ('20000000-0000-0000-0000-000000000003', 'Alpaca')
on conflict do nothing;

insert into public.services (id, name, suggested_price) values
  ('21000000-0000-0000-0000-000000000001', 'Limpieza y pulido', 80),
  ('21000000-0000-0000-0000-000000000002', 'Soldadura', 150),
  ('21000000-0000-0000-0000-000000000003', 'Baño de plata', 250)
on conflict do nothing;

insert into public.workshops (id, name, contact_name, phone, address) values
  ('22000000-0000-0000-0000-000000000001', 'Taller Quispe', 'Marco Quispe', '+51987000111', 'Jr. Cusco 120, Lima'),
  ('22000000-0000-0000-0000-000000000002', 'Orfebrería Mendoza', 'Rosa Mendoza', '+51987000222', 'Av. Arequipa 850, Lima')
on conflict do nothing;

insert into public.clients (id, kind, first_name, last_name, legal_name, document_type, document_number, phone, email, address) values
  ('30000000-0000-0000-0000-000000000001', 'persona', 'María', 'Torres Vega', '', 'dni', '40123456', '+51999111222', 'maria.torres@example.com', 'Av. Larco 345, Miraflores'),
  ('30000000-0000-0000-0000-000000000002', 'persona', 'Carlos', 'Rojas Salas', '', 'dni', '45678901', '+51999333444', 'carlos.rojas@example.com', 'Calle Los Pinos 78, San Isidro'),
  ('30000000-0000-0000-0000-000000000003', 'empresa', '', '', 'Joyería El Sol S.A.C.', 'ruc', '20512345678', '+51014445566', 'compras@joyeriaelsol.example.com', 'Jr. de la Unión 560, Lima')
on conflict do nothing;

insert into public.contacts (id, client_id, first_name, last_name, position, phone, email) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'Lucía', 'Paredes', 'Compras', '+51999555666', 'lucia.paredes@joyeriaelsol.example.com')
on conflict do nothing;

insert into public.restorations (id, client_id, contact_id, payment_type, deposit_percent, notes) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', null, 'a_cuenta', 50, 'Reliquias de familia, entrega sin apuro.'),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', null, 'contado', null, ''),
  ('40000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000003', '31000000-0000-0000-0000-000000000001', 'credito', null, 'Lote de piezas de exhibición.')
on conflict do nothing;

insert into public.pieces (id, restoration_id, status, workshop_id, description, measure, material_id, material_name, service_id, service_name, weight_grams, price, arrived_at, approved_at, received_at, first_sent_at) values
  ('50000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'registrada', null,
    'Cadena de plata con eslabón roto', '45 cm', '20000000-0000-0000-0000-000000000001', 'Plata 950',
    '21000000-0000-0000-0000-000000000002', 'Soldadura', 18.5, 150, null, null, null, null),
  ('50000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001', 'recibida', null,
    'Anillo de oro opaco', 'Talla 7', '20000000-0000-0000-0000-000000000002', 'Oro 18k',
    '21000000-0000-0000-0000-000000000001', 'Limpieza y pulido', 4.2, 80, now() - interval '2 days', now() - interval '3 days', now() - interval '2 days', null),
  ('50000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000002', 'enviada_taller', '22000000-0000-0000-0000-000000000001',
    'Bandeja de plata con manchas', '30 x 20 cm', '20000000-0000-0000-0000-000000000001', 'Plata 950',
    '21000000-0000-0000-0000-000000000003', 'Baño de plata', 640, 250, now() - interval '5 days', now() - interval '6 days', now() - interval '5 days', now() - interval '4 days'),
  ('50000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000003', 'aprobada', null,
    'Collar de alpaca con broche suelto', '50 cm', '20000000-0000-0000-0000-000000000003', 'Alpaca',
    '21000000-0000-0000-0000-000000000002', 'Soldadura', 25, 120, null, now() - interval '1 day', null, null),
  ('50000000-0000-0000-0000-000000000005', '40000000-0000-0000-0000-000000000003', 'aprobada', null,
    'Pulsera de plata deslustrada', '19 cm', '20000000-0000-0000-0000-000000000001', 'Plata 950',
    '21000000-0000-0000-0000-000000000001', 'Limpieza y pulido', 22, 80, null, now() - interval '1 day', null, null)
on conflict do nothing;
