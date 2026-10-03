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
