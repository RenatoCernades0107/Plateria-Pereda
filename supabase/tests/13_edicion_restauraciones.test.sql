begin;

select plan(9);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000009a1', 'ventas@editar.test', '{"role":"ventas"}', '{}'),
  ('00000000-0000-0000-0000-0000000009a2', 'logistica@editar.test', '{"role":"logistica"}', '{}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000e901', 'persona', 'Ana', 'gid://shopify/Customer/901');
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000f901', '00000000-0000-0000-0000-00000000e901', 'contado');
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-00000000a911', '00000000-0000-0000-0000-00000000f901', 'Fuente', 100),
  ('00000000-0000-0000-0000-00000000a912', '00000000-0000-0000-0000-00000000f901', 'Bandeja', 50),
  ('00000000-0000-0000-0000-00000000a913', '00000000-0000-0000-0000-00000000f901', 'Jarra', 30);
-- Lo que harán los RPC de estados (8.3): una anulada y una entregada.
update public.pieces set status = 'anulada' where id = '00000000-0000-0000-0000-00000000a912';
update public.pieces set status = 'entregada' where id = '00000000-0000-0000-0000-00000000a913';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

select lives_ok(
  $$ update public.pieces set description = 'Fuente ovalada', price = 120
     where id = '00000000-0000-0000-0000-00000000a911' $$,
  'antes de la orden se editan descripción y precio'
);
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
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000009a1","role":"authenticated"}', true);

select lives_ok(
  $$ update public.pieces set material_name = 'Plata 950', service_name = 'Pulido'
     where id = '00000000-0000-0000-0000-00000000a911' $$,
  'con la orden creada se editan los campos que no tocan Shopify'
);
select throws_ok(
  $$ update public.pieces set price = 130 where id = '00000000-0000-0000-0000-00000000a911' $$,
  '23514', null, 'con la orden creada el precio no se cambia directamente (P12)'
);
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
  $$ insert into public.pieces (restoration_id, description, price)
     values ('00000000-0000-0000-0000-00000000f901', 'Otra', 10) $$,
  '23514', null, 'no se agregan piezas a una restauración completada'
);

select * from finish();
rollback;
