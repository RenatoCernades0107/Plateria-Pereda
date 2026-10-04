begin;

select plan(12);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@talleres.test', '{"role":"admin"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d2', 'ventas@talleres.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000000d3', 'logistica@talleres.test', '{"role":"logistica"}', '{"full_name":"Lola Logística"}');

-- Logística crea y edita
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d3","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.workshops (id, name, phone) values
       ('00000000-0000-0000-0000-00000000aaa1', 'Taller Prueba Uno', '999 111 222') $$,
  'logística crea un taller'
);
select throws_ok(
  $$ insert into public.workshops (name) values ('  taller prueba UNO ') $$,
  '23505', null, 'el nombre es único sin distinguir mayúsculas ni espacios'
);
select throws_ok(
  $$ insert into public.workshops (name) values (' a ') $$,
  '23514', null, 'el nombre tiene al menos 2 caracteres'
);
update public.workshops set active = false where id = '00000000-0000-0000-0000-00000000aaa1';
select is(
  (select active from public.workshops where id = '00000000-0000-0000-0000-00000000aaa1'),
  false,
  'logística desactiva un taller'
);
select throws_ok(
  $$ delete from public.workshops where id = '00000000-0000-0000-0000-00000000aaa1' $$,
  '42501', null, 'los talleres no se borran, solo se desactivan'
);

-- Ventas lee pero no crea ni edita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.workshops where id = '00000000-0000-0000-0000-00000000aaa1'),
  1,
  'ventas lee los talleres'
);
select throws_ok(
  $$ insert into public.workshops (name) values ('Taller de ventas') $$,
  '42501', null, 'ventas no crea talleres'
);
update public.workshops set name = 'Cambiado' where id = '00000000-0000-0000-0000-00000000aaa1';

-- Admin edita
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d1","role":"authenticated"}', true);
update public.workshops set notes = 'Buen acabado' where id = '00000000-0000-0000-0000-00000000aaa1';

reset role;
select is(
  (select name from public.workshops where id = '00000000-0000-0000-0000-00000000aaa1'),
  'Taller Prueba Uno',
  'ventas no edita talleres'
);
select is(
  (select notes from public.workshops where id = '00000000-0000-0000-0000-00000000aaa1'),
  'Buen acabado',
  'admin edita talleres'
);
select results_eq(
  $$ select actor_name, action, changes from public.audit_log
     where table_name = 'workshops' and record_id = '00000000-0000-0000-0000-00000000aaa1'
     order by id $$,
  $$ values
       ('Lola Logística', 'insert', '{"name": {"old": null, "new": "Taller Prueba Uno"}, "phone": {"old": null, "new": "999 111 222"}, "active": {"old": null, "new": true}}'::jsonb),
       ('Lola Logística', 'update', '{"active": {"old": true, "new": false}}'::jsonb),
       ('admin@talleres.test', 'update', '{"notes": {"old": "", "new": "Buen acabado"}}'::jsonb) $$,
  'los cambios de talleres quedan auditados'
);

-- Usuario desactivado y anónimo
update public.profiles set active = false where id = '00000000-0000-0000-0000-0000000000d2';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000d2","role":"authenticated"}', true);
select is((select count(*)::int from public.workshops), 0, 'un usuario desactivado no lee talleres');

reset role;
set local role anon;
select throws_ok($$ select * from public.workshops $$, '42501', null, 'un anónimo no lee talleres');

select * from finish();
rollback;
