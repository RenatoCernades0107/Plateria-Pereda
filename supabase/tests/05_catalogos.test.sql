begin;

select plan(14);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@catalogos.test', '{"role":"admin"}', '{"full_name":"Ana Admin"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'ventas@catalogos.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000000e3', 'logistica@catalogos.test', '{"role":"logistica"}', '{}');

select results_eq(
  $$ select name from public.payment_methods order by name $$,
  $$ values ('Efectivo'), ('Plin'), ('Tarjeta'), ('Yape') $$,
  'los métodos de pago iniciales son efectivo, tarjeta, Yape y Plin'
);

-- Admin gestiona
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e1","role":"authenticated"}', true);
select lives_ok(
  $$ insert into public.materials (name) values ('Plata 950 prueba') $$,
  'admin crea un material'
);
select lives_ok(
  $$ insert into public.services (name, suggested_price) values ('Limpieza prueba', 35.50) $$,
  'admin crea un servicio con precio sugerido'
);
select throws_ok(
  $$ insert into public.services (name, suggested_price) values ('Pulido prueba', -1) $$,
  '23514', null, 'el precio sugerido no puede ser negativo'
);
select throws_ok(
  $$ insert into public.payment_methods (name) values ('  YAPE ') $$,
  '23505', null, 'los nombres son únicos sin distinguir mayúsculas'
);
update public.services set active = false where name = 'Limpieza prueba';
select throws_ok(
  $$ delete from public.materials where name = 'Plata 950 prueba' $$,
  '42501', null, 'los ítems no se borran, solo se desactivan'
);

-- Ventas lee todo pero no gestiona
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e2","role":"authenticated"}', true);
select ok(
  (select count(*) from public.services where name = 'Limpieza prueba') = 1
  and (select count(*) from public.payment_methods) >= 4,
  'ventas lee servicios y métodos de pago'
);
select throws_ok(
  $$ insert into public.materials (name) values ('Oro de ventas') $$,
  '42501', null, 'ventas no crea ítems'
);
update public.payment_methods set name = 'Cambiado' where name = 'Yape';

-- Logística solo lee materiales
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000e3","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.materials where name = 'Plata 950 prueba'),
  1,
  'logística lee los materiales'
);
select is((select count(*)::int from public.services), 0, 'logística no ve los servicios (tienen precios)');
select is((select count(*)::int from public.payment_methods), 0, 'logística no ve los métodos de pago');
select throws_ok(
  $$ insert into public.materials (name) values ('Oro de logística') $$,
  '42501', null, 'logística no crea ítems'
);

reset role;
select is(
  (select count(*)::int from public.payment_methods where name = 'Yape'),
  1,
  'ventas no edita los catálogos'
);
select results_eq(
  $$ select actor_name, action, changes from public.audit_log
     where table_name = 'services' and actor_id = '00000000-0000-0000-0000-0000000000e1'
     order by id $$,
  $$ values
       ('Ana Admin', 'insert', '{"name": {"old": null, "new": "Limpieza prueba"}, "active": {"old": null, "new": true}, "suggested_price": {"old": null, "new": 35.50}}'::jsonb),
       ('Ana Admin', 'update', '{"active": {"old": true, "new": false}}'::jsonb) $$,
  'los cambios de los catálogos quedan auditados'
);

select * from finish();
rollback;
