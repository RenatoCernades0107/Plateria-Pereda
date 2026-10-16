begin;

select plan(14);

-- Estas pruebas no tratan pagos: se entrega como si el saldo estuviera confirmado (P45).
select set_config('app.deliver_with_balance', 'on', true);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'ventas@editar.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000009a2', 'logistica@editar.test', '{"role":"logistica"}', '{}'),
  ('00000000-0000-0000-0000-0000000009a3', 'admin@editar.test', '{"role":"admin"}', '{}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000e901', 'persona', 'Ana', 'gid://shopify/Customer/901');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000e901', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000a911', '00000000-0000-0000-0000-00000000f901', 'Fuente', 100),
  ('00000000-0000-0000-0000-00000000a912', '00000000-0000-0000-0000-00000000f901', 'Bandeja', 50),
  ('00000000-0000-0000-0000-00000000a913', '00000000-0000-0000-0000-00000000f901', 'Jarra', 30),
  ('00000000-0000-0000-0000-00000000a914', '00000000-0000-0000-0000-00000000f901', 'Copa', null),
  ('00000000-0000-0000-0000-00000000a915', '00000000-0000-0000-0000-00000000f901', 'Plato', null);
-- Lo que harán los RPC de estados (8.3): una anulada y una entregada.
update public.pieces set status = 'anulada' where id = '00000000-0000-0000-0000-00000000a912';
update public.pieces set status = 'entregada'
  where id in ('00000000-0000-0000-0000-00000000a913', '00000000-0000-0000-0000-00000000a915');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

select lives_ok(
  $$ update public.pieces set description = 'Fuente ovalada', price = 100
     where id = '00000000-0000-0000-0000-00000000a911' $$,
  'ventas edita la descripción (el precio igual no cuenta como cambio)'
);
select throws_ok(
  $$ update public.pieces set price = 120 where id = '00000000-0000-0000-0000-00000000a911' $$,
  '42501', 'Solo el administrador asigna el precio de venta.', 'ventas no cambia el precio de venta (D58)'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a3","role":"authenticated"}', true);
select lives_ok(
  $$ update public.pieces set price = 120 where id = '00000000-0000-0000-0000-00000000a911' $$,
  'antes de la orden el admin cambia el precio'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);
select throws_ok(
  $$ update public.pieces set notes = 'x' where id = '00000000-0000-0000-0000-00000000a912' $$,
  '23514', null, 'una pieza anulada no se edita'
);
select lives_ok(
  $$ update public.pieces set notes = 'Recogió el hijo' where id = '00000000-0000-0000-0000-00000000a913' $$,
  'de una pieza entregada se editan las notas'
);
select throws_ok(
  $$ update public.pieces set measure = '20 cm' where id = '00000000-0000-0000-0000-00000000a913' $$,
  '23514', null, 'de una pieza entregada no se editan otros datos'
);

reset role;
update public.restorations set shopify_order_id = 'gid://shopify/Order/901'
  where id = '00000000-0000-0000-0000-00000000f901';
insert into public.materials (id, name) values ('00000000-0000-0000-0000-00000000a9f1', 'Plata de edición');
insert into public.services (name) values ('Pulido') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

select lives_ok(
  $$ update public.pieces set material_ids = array['00000000-0000-0000-0000-00000000a9f1']::uuid[], service_name = 'Pulido'
     where id = '00000000-0000-0000-0000-00000000a911' $$,
  'con la orden creada se editan los campos que no tocan Shopify'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a3","role":"authenticated"}', true);
select throws_ok(
  $$ update public.pieces set price = 130 where id = '00000000-0000-0000-0000-00000000a911' $$,
  '23514', null, 'con la orden creada el precio no se cambia directamente (P12)'
);
select lives_ok(
  $$ update public.pieces set price = 45 where id = '00000000-0000-0000-0000-00000000a914' $$,
  'con la orden creada el admin sí asigna el precio que faltaba (D58)'
);
select lives_ok(
  $$ update public.pieces set price = 30 where id = '00000000-0000-0000-0000-00000000a915' $$,
  'a una pieza entregada sin precio también se le asigna'
);
select throws_ok(
  $$ update public.pieces set price = 35 where id = '00000000-0000-0000-0000-00000000a915' $$,
  '23514', null, 'pero el precio asignado de una pieza entregada ya no cambia'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);
select lives_ok(
  $$ update public.restorations set payment_type = 'a_cuenta', deposit_percent = 30, notes = 'Cambió a cuenta'
     where id = '00000000-0000-0000-0000-00000000f901' $$,
  'tipo de pago, % y notas se editan con la orden creada'
);

reset role;
select is(
  (select count(*)::int from public.audit_log
   where record_id = '00000000-0000-0000-0000-00000000a911' and action = 'update'
     and changes ? 'material_name'),
  1, 'los cambios quedan auditados'
);
update public.restorations set status = 'completada' where id = '00000000-0000-0000-0000-00000000f901';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.pieces (restoration_id, description)
     values ('00000000-0000-0000-0000-00000000f901', 'Otra') $$,
  '23514', null, 'no se agregan piezas a una restauración completada'
);

select * from finish();
rollback;
