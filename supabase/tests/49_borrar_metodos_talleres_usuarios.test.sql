begin;

select plan(20);

-- Borrar métodos de pago, talleres y usuarios: solo el admin, y solo si nadie los usa (si
-- no, se desactivan). Un usuario se borra solo si no registró nada; nunca el último admin.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000e91', 'admin@borrar49.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000000e92', 'ventas@borrar49.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000e93', 'logistica@borrar49.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}'),
  ('00000000-0000-0000-0000-000000000e94', 'nueva@borrar49.test', '{"role":"ventas"}', '{"full_name":"Nora Nueva"}'),
  ('00000000-0000-0000-0000-000000000e95', 'nuevo@borrar49.test', '{"role":"ventas"}', '{"full_name":"Nico Nuevo"}');

insert into public.payment_methods (id, name) values
  ('00000000-0000-0000-0000-00000000e911', 'Sin uso Prueba'),
  ('00000000-0000-0000-0000-00000000e912', 'Transferencia Prueba'),
  ('00000000-0000-0000-0000-00000000e913', 'Otro Prueba');
insert into public.workshops (id, name) values
  ('00000000-0000-0000-0000-00000000e921', 'Taller Sin Uso'),
  ('00000000-0000-0000-0000-00000000e922', 'Taller Actual'),
  ('00000000-0000-0000-0000-00000000e923', 'Taller Pasado'),
  ('00000000-0000-0000-0000-00000000e924', 'Taller Ambos'),
  ('00000000-0000-0000-0000-00000000e925', 'Taller Libre');

-- Datos sin autor (como los del sistema): no cuentan como actividad de nadie.
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000e930', 'persona', 'Borrar');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000e940', '00000000-0000-0000-0000-00000000e930', 'contado');
insert into public.pieces (id, restoration_id, description, price, workshop_id) values
  ('00000000-0000-0000-0000-00000000e951', '00000000-0000-0000-0000-00000000e940', 'En el taller actual', 300,
   '00000000-0000-0000-0000-00000000e922'),
  ('00000000-0000-0000-0000-00000000e952', '00000000-0000-0000-0000-00000000e940', 'Ahora en Ambos', 100,
   '00000000-0000-0000-0000-00000000e924'),
  ('00000000-0000-0000-0000-00000000e953', '00000000-0000-0000-0000-00000000e940', 'Pasó por dos talleres', 100,
   null);
insert into public.piece_status_history (piece_id, restoration_id, event, from_status, to_status, workshop_id) values
  ('00000000-0000-0000-0000-00000000e953', '00000000-0000-0000-0000-00000000e940', 'envio_taller',
   'aprobada', 'aprobada', '00000000-0000-0000-0000-00000000e923'),
  ('00000000-0000-0000-0000-00000000e952', '00000000-0000-0000-0000-00000000e940', 'envio_taller',
   'aprobada', 'aprobada', '00000000-0000-0000-0000-00000000e924'),
  ('00000000-0000-0000-0000-00000000e953', '00000000-0000-0000-0000-00000000e940', 'envio_taller',
   'aprobada', 'aprobada', '00000000-0000-0000-0000-00000000e924');
insert into public.payments (restoration_id, amount, payment_method_id) values
  ('00000000-0000-0000-0000-00000000e940', 50, '00000000-0000-0000-0000-00000000e912'),
  ('00000000-0000-0000-0000-00000000e940', 50, '00000000-0000-0000-0000-00000000e912');

-- Lo que registró Vera (ventas) y el único cambio de Lalo (logística).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000e92","role":"authenticated"}', true);
insert into public.clients (id, kind, legal_name, document_type, document_number)
  values ('00000000-0000-0000-0000-00000000e931', 'empresa', 'De Vera S.A.C.', 'ruc', '20999999983');
insert into public.contacts (client_id, first_name)
  values ('00000000-0000-0000-0000-00000000e931', 'Contacto de Vera');
insert into public.restorations (client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000e931', 'contado');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000e93","role":"authenticated"}', true);
update public.workshops set notes = 'Buen acabado' where id = '00000000-0000-0000-0000-00000000e925';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000e91","role":"authenticated"}', true);

-- 1. Métodos de pago.
delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000e911';
select is(
  (select count(*)::int from public.payment_methods where id = '00000000-0000-0000-0000-00000000e911'),
  0, 'el admin borra un método de pago que ningún pago usa'
);
select throws_ok(
  $$ delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000e912' $$,
  '23503', '“Transferencia Prueba” está en uso en 2 pagos. Desactívalo en su lugar.',
  'no se borra un método de pago que usan pagos, y el aviso dice cuántos'
);
update public.payment_methods set active = false where id = '00000000-0000-0000-0000-00000000e912';
select throws_ok(
  $$ delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000e912' $$,
  '23503', null, 'desactivado pero en uso tampoco se borra'
);

-- 2. Talleres: cuenta cada pieza una vez, la tenga ahora o en su historial.
delete from public.workshops where id = '00000000-0000-0000-0000-00000000e921';
select is(
  (select count(*)::int from public.workshops where id = '00000000-0000-0000-0000-00000000e921'),
  0, 'el admin borra un taller por el que no pasó ninguna pieza'
);
select throws_ok(
  $$ delete from public.workshops where id = '00000000-0000-0000-0000-00000000e922' $$,
  '23503', '“Taller Actual” está en uso en 1 pieza. Desactívalo en su lugar.',
  'no se borra un taller que tiene una pieza'
);
select throws_ok(
  $$ delete from public.workshops where id = '00000000-0000-0000-0000-00000000e923' $$,
  '23503', '“Taller Pasado” está en uso en 1 pieza. Desactívalo en su lugar.',
  'ni uno que solo está en el historial de una pieza'
);
select throws_ok(
  $$ delete from public.workshops where id = '00000000-0000-0000-0000-00000000e924' $$,
  '23503', '“Taller Ambos” está en uso en 2 piezas. Desactívalo en su lugar.',
  'el aviso cuenta cada pieza una vez'
);

-- 3. Usuarios.
delete from public.profiles where id = '00000000-0000-0000-0000-000000000e94';
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000e94'),
  0, 'el admin borra el perfil de un usuario que no registró nada'
);
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-000000000e92' $$,
  '23503',
  '“Vera Ventas” tiene actividad en el sistema (1 restauración, 1 cliente y 1 contacto). Desactívalo en su lugar.',
  'no se borra a quien registró algo, y el aviso dice qué'
);
update public.profiles set active = false where id = '00000000-0000-0000-0000-000000000e92';
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-000000000e92' $$,
  '23503', null, 'desactivado tampoco se borra'
);
select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-000000000e93' $$,
  '23503',
  '“Lalo Logística” tiene actividad en el sistema (1 cambio en la auditoría). Desactívalo en su lugar.',
  'un cambio que solo quedó en la auditoría también cuenta'
);
delete from public.profiles where id = '00000000-0000-0000-0000-000000000e91';
select is(
  (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000e91'),
  1, 'el admin no se borra a sí mismo'
);

-- 4. Ventas y logística no borran nada de esto (las políticas lo impiden sin error).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000e93","role":"authenticated"}', true);
delete from public.workshops where id = '00000000-0000-0000-0000-00000000e925';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000e95","role":"authenticated"}', true);
delete from public.payment_methods where id = '00000000-0000-0000-0000-00000000e913';
delete from public.profiles where id = '00000000-0000-0000-0000-000000000e95';
reset role;
select is(
  (select count(*)::int from public.workshops where id = '00000000-0000-0000-0000-00000000e925')
  + (select count(*)::int from public.payment_methods where id = '00000000-0000-0000-0000-00000000e913')
  + (select count(*)::int from public.profiles where id = '00000000-0000-0000-0000-000000000e95'),
  3, 'logística y ventas no borran talleres, métodos de pago ni usuarios'
);

-- 5. Con la clave secreta (auth.admin.deleteUser): el perfil se borra en cascada, y el
--    trigger también lo frena.
select set_config('request.jwt.claims', '', true);
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000e94' $$,
  'después del perfil se borra el usuario de Auth'
);
select is(
  (select count(*)::int from auth.users where id = '00000000-0000-0000-0000-000000000e94'),
  0, 'y ya no existe'
);
select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000e92' $$,
  '23503', null, 'borrar desde Auth a quien tiene actividad también se rechaza'
);
select lives_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000e95' $$,
  'borrar desde Auth a quien no registró nada borra su perfil en cascada'
);

-- 6. Queda en la auditoría con quien lo hizo; los rechazos no dejan registro.
select results_eq(
  $$ select table_name, action, actor_name from public.audit_log
     where action = 'delete' and record_id in (
       '00000000-0000-0000-0000-00000000e911', '00000000-0000-0000-0000-00000000e921',
       '00000000-0000-0000-0000-000000000e94')
     order by table_name $$,
  $$ values ('payment_methods', 'delete', 'Ada Admin'),
            ('profiles', 'delete', 'Ada Admin'),
            ('workshops', 'delete', 'Ada Admin') $$,
  'cada borrado queda en la auditoría con quien lo hizo'
);
select is(
  (select count(*)::int from public.audit_log where action = 'delete' and record_id in (
     '00000000-0000-0000-0000-00000000e912', '00000000-0000-0000-0000-00000000e922',
     '00000000-0000-0000-0000-000000000e92', '00000000-0000-0000-0000-000000000e93')),
  0, 'un borrado rechazado no deja registro'
);

-- 7. Nunca se borra al último admin activo (ni con la clave secreta).
update public.profiles set active = false
  where role = 'admin' and id <> '00000000-0000-0000-0000-000000000e91';
select throws_ok(
  $$ delete from auth.users where id = '00000000-0000-0000-0000-000000000e91' $$,
  '23503', 'No se puede eliminar al último administrador activo.',
  'no se borra al último administrador activo'
);

select * from finish();
rollback;
