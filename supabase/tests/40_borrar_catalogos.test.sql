begin;

select plan(15);

-- Borrar materiales y servicios del catálogo: solo el admin, y solo si ninguna pieza ni
-- cotización de WhatsApp los usa (si no, se desactivan).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000c41', 'admin@borrar.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-000000000c42', 'ventas@borrar.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-000000000c43', 'logistica@borrar.test', '{"role":"logistica"}', '{}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-00000000c420', 'persona', 'Borrar');
insert into public.materials (id, name, active) values
  ('00000000-0000-0000-0000-00000000c431', 'Sin uso M', true),
  ('00000000-0000-0000-0000-00000000c432', 'Primero M', true),
  ('00000000-0000-0000-0000-00000000c433', 'Segundo M', true),
  ('00000000-0000-0000-0000-00000000c434', 'Cotizado M', true),
  ('00000000-0000-0000-0000-00000000c435', 'Ambos M', true);
insert into public.services (id, name, active) values
  ('00000000-0000-0000-0000-00000000c441', 'Sin uso S', true),
  ('00000000-0000-0000-0000-00000000c442', 'En pieza S', true),
  ('00000000-0000-0000-0000-00000000c443', 'Cotizado S', true);
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000c450', '00000000-0000-0000-0000-00000000c420', 'contado');
insert into public.pieces (id, restoration_id, description, price, service_id, material_ids) values
  ('00000000-0000-0000-0000-00000000c461', '00000000-0000-0000-0000-00000000c450', 'Con dos materiales', 100,
   '00000000-0000-0000-0000-00000000c442',
   array['00000000-0000-0000-0000-00000000c432', '00000000-0000-0000-0000-00000000c433']::uuid[]),
  ('00000000-0000-0000-0000-00000000c462', '00000000-0000-0000-0000-00000000c450', 'Con el material de ambos', 50,
   null, array['00000000-0000-0000-0000-00000000c435']::uuid[]);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c41","role":"authenticated"}', true);

create temporary table q as
  select * from public.create_whatsapp_quote('00000000-0000-0000-0000-00000000c420', null, '', '', 'contado', null, '',
    '[{"description":"Cotizada","price":"80","service_id":"00000000-0000-0000-0000-00000000c443",
       "material_ids":["00000000-0000-0000-0000-00000000c434","00000000-0000-0000-0000-00000000c435"]}]'::jsonb);
grant select on q to authenticated;

-- 1. Sin uso se borran.
delete from public.materials where id = '00000000-0000-0000-0000-00000000c431';
delete from public.services where id = '00000000-0000-0000-0000-00000000c441';
select is(
  (select count(*)::int from public.materials where id = '00000000-0000-0000-0000-00000000c431')
  + (select count(*)::int from public.services where id = '00000000-0000-0000-0000-00000000c441'),
  0,
  'el admin borra un material y un servicio que nadie usa'
);

-- 2. En uso no se borran, y el aviso cuenta dónde (el servicio de una pieza, el
--    material que es el primero o el segundo, y lo que solo usa una cotización).
select throws_ok(
  $$ delete from public.services where id = '00000000-0000-0000-0000-00000000c442' $$,
  '23503', '“En pieza S” está en uso en 1 pieza. Desactívalo en su lugar.',
  'no se borra un servicio que usa una pieza'
);
select throws_ok(
  $$ delete from public.materials where id = '00000000-0000-0000-0000-00000000c432' $$,
  '23503', '“Primero M” está en uso en 1 pieza. Desactívalo en su lugar.',
  'no se borra el material que es el primero de una pieza'
);
select throws_ok(
  $$ delete from public.materials where id = '00000000-0000-0000-0000-00000000c433' $$,
  '23503', '“Segundo M” está en uso en 1 pieza. Desactívalo en su lugar.',
  'tampoco el que es el segundo (material_ids no tiene FK)'
);
select throws_ok(
  $$ delete from public.services where id = '00000000-0000-0000-0000-00000000c443' $$,
  '23503', '“Cotizado S” está en uso en 1 cotización de WhatsApp. Desactívalo en su lugar.',
  'no se borra un servicio que usa una cotización de WhatsApp'
);
select throws_ok(
  $$ delete from public.materials where id = '00000000-0000-0000-0000-00000000c434' $$,
  '23503', '“Cotizado M” está en uso en 1 cotización de WhatsApp. Desactívalo en su lugar.',
  'ni un material que solo usa una cotización'
);
select throws_ok(
  $$ delete from public.materials where id = '00000000-0000-0000-0000-00000000c435' $$,
  '23503', '“Ambos M” está en uso en 1 pieza y 1 cotización de WhatsApp. Desactívalo en su lugar.',
  'el aviso suma piezas y cotizaciones'
);

-- 3. Desactivado pero con uso sigue sin poder borrarse.
update public.services set active = false where id = '00000000-0000-0000-0000-00000000c442';
select throws_ok(
  $$ delete from public.services where id = '00000000-0000-0000-0000-00000000c442' $$,
  '23503', null, 'un servicio desactivado que aún está en una pieza tampoco se borra'
);
select is(
  (select active from public.services where id = '00000000-0000-0000-0000-00000000c442'),
  false, 'y se queda desactivado en el catálogo'
);

-- 4. Al soltarlo, se puede borrar.
update public.pieces set service_id = null, service_name = ''
  where id = '00000000-0000-0000-0000-00000000c461';
delete from public.services where id = '00000000-0000-0000-0000-00000000c442';
select is(
  (select count(*)::int from public.services where id = '00000000-0000-0000-0000-00000000c442'),
  0, 'cuando ninguna pieza lo usa, el servicio desactivado se borra'
);

-- 5. Ventas y logística no borran (las políticas lo impiden sin error).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c42","role":"authenticated"}', true);
delete from public.materials where id = '00000000-0000-0000-0000-00000000c435';
delete from public.services where id = '00000000-0000-0000-0000-00000000c443';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c43","role":"authenticated"}', true);
delete from public.materials where id = '00000000-0000-0000-0000-00000000c435';

reset role;
select is(
  (select count(*)::int from public.materials where id = '00000000-0000-0000-0000-00000000c435')
  + (select count(*)::int from public.services where id = '00000000-0000-0000-0000-00000000c443'),
  2, 'ventas y logística no borran materiales ni servicios'
);

-- 6. Los métodos de pago no se borran.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000c41","role":"authenticated"}', true);
select throws_ok(
  $$ delete from public.payment_methods where name = 'Yape' $$,
  '42501', null, 'los métodos de pago no se borran, ni el admin'
);

-- 7. Queda en el historial.
reset role;
select results_eq(
  $$ select table_name, action, actor_name from public.audit_log
     where action = 'delete' and record_id in (
       '00000000-0000-0000-0000-00000000c431', '00000000-0000-0000-0000-00000000c441',
       '00000000-0000-0000-0000-00000000c442')
     order by table_name, record_id $$,
  $$ values ('materials', 'delete', 'Ada Admin'),
            ('services', 'delete', 'Ada Admin'),
            ('services', 'delete', 'Ada Admin') $$,
  'cada borrado queda en el historial con quien lo hizo'
);

-- 8. Los rechazos no dejan nada en el historial ni cambian la pieza.
select is(
  (select count(*)::int from public.audit_log where action = 'delete'
     and record_id in ('00000000-0000-0000-0000-00000000c432', '00000000-0000-0000-0000-00000000c435')),
  0, 'un borrado rechazado no deja registro'
);
select is(
  (select material_ids from public.pieces where id = '00000000-0000-0000-0000-00000000c461'),
  array['00000000-0000-0000-0000-00000000c432', '00000000-0000-0000-0000-00000000c433']::uuid[],
  'y las piezas conservan sus materiales'
);

select * from finish();
rollback;
