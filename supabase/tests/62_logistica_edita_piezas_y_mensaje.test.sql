begin;

select plan(11);

-- Logística edita piezas, recibe el nombre del cliente para la guía de taller y los
-- datos del mensaje de cotización (2026-10-30). Solo en guías activas (D24).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000062a2', 'ventas@log62.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000062a3', 'logistica@log62.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name, phone)
  values ('00000000-0000-0000-0000-0000000062c1', 'persona', 'Rosa', '+51994000111');
-- R1: guía activa. R2: guía pasada (su única pieza, anulada).
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000062d1', '00000000-0000-0000-0000-0000000062c1', 'contado'),
  ('00000000-0000-0000-0000-0000000062d2', '00000000-0000-0000-0000-0000000062c1', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000062e1', '00000000-0000-0000-0000-0000000062d1', 'Fuente', 100),
  ('00000000-0000-0000-0000-0000000062e2', '00000000-0000-0000-0000-0000000062d2', 'Bandeja', 100);
update public.pieces set status = 'anulada', cancelled_at = now()
  where id = '00000000-0000-0000-0000-0000000062e2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a3","role":"authenticated"}', true);

-- 1. Editar la pieza: sin p_set_price el precio no cambia.
select is(
  public.update_piece_as_logistics('00000000-0000-0000-0000-0000000062e1', 2, 'Fuente ovalada',
    '30 cm', '{}', '{}', 120, 'Pulir', false, null),
  '00000000-0000-0000-0000-0000000062d1'::uuid,
  'logística edita la pieza (devuelve la restauración)'
);
select results_eq(
  $$ select quantity, description, measure, weight_grams, notes, price
     from public.pieces_operational where id = '00000000-0000-0000-0000-0000000062e1' $$,
  $$ values (2, 'Fuente ovalada'::text, '30 cm'::text, 120::numeric, 'Pulir'::text, 100::numeric) $$,
  'los datos de la pieza quedan guardados, sin tocar el precio'
);
select lives_ok(
  $$ select public.update_piece_as_logistics('00000000-0000-0000-0000-0000000062e1', 2,
       'Fuente ovalada', '30 cm', '{}', '{}', 120, 'Pulir', false, null,
       p_set_price => true, p_price => 150) $$,
  'con p_set_price, logística cambia el precio de venta'
);
select is(
  (select price from public.pieces_operational where id = '00000000-0000-0000-0000-0000000062e1'),
  150::numeric, 'el precio de venta cambia'
);
select throws_ok(
  $$ select public.update_piece_as_logistics('00000000-0000-0000-0000-0000000062e2', 1,
       'Bandeja', '', '{}', '{}', null, '', false, null) $$,
  '23503', 'La pieza no existe', 'logística no edita piezas de guías pasadas'
);

-- 2. Nombre del cliente para la guía de taller.
select is(
  public.restoration_client_name('00000000-0000-0000-0000-0000000062d1'),
  'Rosa', 'logística recibe el nombre del cliente de una guía activa'
);
select is(
  public.restoration_client_name('00000000-0000-0000-0000-0000000062d2'),
  null, 'pero no el de una guía pasada'
);

-- 3. Datos del mensaje de cotización.
select results_eq(
  $$ select client_name, client_phone, contact_name
     from public.restoration_quote_message_data('00000000-0000-0000-0000-0000000062d1') $$,
  $$ values ('Rosa'::text, '+51994000111'::text, null::text) $$,
  'logística recibe los datos del cliente para el mensaje de cotización'
);
select is_empty(
  $$ select * from public.restoration_quote_message_data('00000000-0000-0000-0000-0000000062d2') $$,
  'pero no de una guía pasada'
);

-- 4. Ventas no usa la RPC de edición de logística (edita la tabla directamente).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000062a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.update_piece_as_logistics('00000000-0000-0000-0000-0000000062e1', 1,
       'Fuente', '', '{}', '{}', null, '', false, null) $$,
  '42501', 'Solo logística edita la pieza por esta vía.', 'ventas no usa la RPC de logística'
);
select is(
  (select count(*)::int from public.restoration_quote_message_data('00000000-0000-0000-0000-0000000062d2')),
  1, 'ventas recibe los datos también de guías pasadas'
);

select * from finish();
rollback;
