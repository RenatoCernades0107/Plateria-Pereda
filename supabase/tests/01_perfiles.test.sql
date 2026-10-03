begin;

select plan(19);

-- Usuarios de prueba (el trigger de auth.users crea sus perfiles).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@prueba.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'ventas@prueba.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'logistica@prueba.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-0000000000a4', 'sinrol@prueba.test', '{"role":"jefe"}', '{"full_name":"  "}');

create temp table usuarios_prueba as
  select id from auth.users where email like '%@prueba.test';
grant select on usuarios_prueba to authenticated;

-- Trigger
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'admin'::public.app_role,
  'el perfil toma el rol de app_metadata'
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  'Vera Ventas',
  'el perfil toma el nombre de user_metadata'
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'),
  'logistica@prueba.test',
  'sin nombre, usa el email'
);
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  'logistica'::public.app_role,
  'un rol desconocido se convierte en logística'
);
select ok(
  (select active from public.profiles where id = '00000000-0000-0000-0000-0000000000a1'),
  'el perfil se crea activo'
);

-- Rol guardado después de crear el usuario (como hace la API de administración)
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"ventas"}'
  where id = '00000000-0000-0000-0000-0000000000a4';
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  'ventas'::public.app_role,
  'un rol agregado después a app_metadata se aplica al perfil'
);
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"jefe"}'
  where id = '00000000-0000-0000-0000-0000000000a4';
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a4'),
  'ventas'::public.app_role,
  'un rol desconocido en app_metadata no cambia el perfil'
);

-- Como ventas
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select is(private.current_app_role(), 'ventas'::public.app_role, 'current_app_role devuelve el rol del usuario');
select ok(private.has_role('{ventas,admin}'), 'has_role es verdadero si el rol está en la lista');
select ok(not private.has_role('{admin}'), 'has_role es falso si el rol no está en la lista');
select is((select count(*)::int from public.profiles), 1, 'ventas solo lee su propio perfil');

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a2';
update public.profiles set full_name = 'Cambiado' where id = '00000000-0000-0000-0000-0000000000a3';

reset role;
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a2'),
  'ventas'::public.app_role,
  'ventas no puede cambiar su propio rol'
);
select is(
  (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'),
  'logistica@prueba.test',
  'ventas no puede editar perfiles ajenos'
);

-- Como admin
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

select is(
  (select count(*)::int from public.profiles where id in (select id from usuarios_prueba)),
  4,
  'admin lee todos los perfiles'
);

update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-0000000000a3';
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000a2';

reset role;
select is(
  (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000a3'),
  'admin'::public.app_role,
  'admin puede cambiar el rol de otro usuario'
);

-- Usuario desactivado
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);

select is(private.current_app_role(), null, 'un usuario desactivado no tiene rol');
select ok(not private.has_role('{ventas}'), 'un usuario desactivado no pasa has_role');

-- Anónimo
reset role;
set local role anon;
select is((select count(*)::int from public.profiles), 0, 'un anónimo no lee perfiles');
select throws_ok(
  $$ select private.has_role('{admin}') $$,
  '42501',
  null,
  'un anónimo no puede usar has_role'
);

select * from finish();
rollback;
