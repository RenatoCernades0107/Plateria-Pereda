begin;

select plan(20);

-- Un pedido de Shopify por pago (pedido del 2026-10-19).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000054a01', 'ventas@pedidos.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000054a02', 'admin@pedidos.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-000000054c01', 'persona', 'Ana');
-- 54f1: guía nueva (total 3 × 26.66 → 80 + 20 = 100); 54f2: guía antigua con su orden.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054c01', 'contado'),
  ('00000000-0000-0000-0000-000000054f02', '00000000-0000-0000-0000-000000054c01', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity, approved_at, status, arrived_at,
    first_sent_at, last_sent_at, last_returned_at) values
  ('00000000-0000-0000-0000-000000054b01', '00000000-0000-0000-0000-000000054f01', 'Cucharas', 26.66, 3, now(),
    'aprobada', now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000054b02', '00000000-0000-0000-0000-000000054f01', 'Jarra', 20, 1, now(),
    'aprobada', now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000054b03', '00000000-0000-0000-0000-000000054f02', 'Copa', 50, 1, now(),
    'aprobada', now(), null, null, null);
update public.restorations set shopify_order_id = 'gid://shopify/Order/54f2', shopify_order_name = '#1001'
where id = '00000000-0000-0000-0000-000000054f02';

create temporary view titles as
  select id, restoration_id, amount, method_name, shopify_order_title, created_at
  from public.payments where kind = 'pago'
    and restoration_id in ('00000000-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054f02');
create temporary view jobs as
  select kind, entity_id, status from public.shopify_sync_jobs
  where entity_id in ('00000000-0000-0000-0000-000000054f01', '00000000-0000-0000-0000-000000054f02');
grant select on titles, jobs to authenticated;

select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-000000054f01'),
  100.00::numeric, 'el total usa el importe con techo de cada pieza'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a01","role":"authenticated"}', true);

-- Adelantos: A1, y un pago repartido en dos métodos toma A2 y A3.
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-000000054f01', 30, 'Efectivo');
select is(
  (select shopify_order_title from titles where restoration_id = '00000000-0000-0000-0000-000000054f01'),
  'Adelanto Guía ' || (select code from public.restorations where id = '00000000-0000-0000-0000-000000054f01') || ' A1',
  'el primer adelanto es A1'
);
select results_eq(
  $$ select kind, status::text from jobs where entity_id = '00000000-0000-0000-0000-000000054f01' $$,
  $$ values ('payment.sync', 'pending') $$,
  'el pago encola su pedido en Shopify'
);
insert into public.payments (restoration_id, amount, method_name) values
  ('00000000-0000-0000-0000-000000054f01', 20, 'Yape'),
  ('00000000-0000-0000-0000-000000054f01', 10, 'Visa');
select results_eq(
  $$ select method_name, right(shopify_order_title, 3) from titles
     where restoration_id = '00000000-0000-0000-0000-000000054f01' order by created_at, method_name $$,
  $$ values ('Efectivo', ' A1'), ('Visa', ' A3'), ('Yape', ' A2') $$,
  'un pago en dos métodos son dos pedidos: A2 y A3'
);
select is(
  (select count(*)::int from jobs where kind = 'payment.sync' and status = 'pending'),
  1, 'una sola conciliación pendiente por guía'
);

-- El pago que completa el total es el Saldo, sin número.
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-000000054f01', 40, 'Transferencia');
select is(
  (select shopify_order_title from titles where method_name = 'Transferencia'),
  'Saldo Guía ' || (select code from public.restorations where id = '00000000-0000-0000-0000-000000054f01'),
  'el pago que completa el total es el Saldo'
);
select is(
  (select payment_status::text from public.restorations where id = '00000000-0000-0000-0000-000000054f01'),
  'pagado', 'y la guía queda Pagada'
);

-- Sube el precio: el siguiente pago que lo vuelve a completar es "Saldo … 2".
reset role;
update public.pieces set price = 30 where id = '00000000-0000-0000-0000-000000054b02';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a01","role":"authenticated"}', true);
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-000000054f01', 10, 'Plin');
select is(
  (select shopify_order_title from titles where method_name = 'Plin'),
  'Saldo Guía ' || (select code from public.restorations where id = '00000000-0000-0000-0000-000000054f01') || ' 2',
  'otro saldo lleva número para no repetir el nombre del pedido'
);

-- Reembolsos: se elige el pago y no pasa de lo que queda de él.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a02","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason) values
       ('00000000-0000-0000-0000-000000054f01', 'reembolso', 5, 'Yape', 'Error') $$,
  '23514', 'Elige el pago que se reembolsa', 'el reembolso dice qué pago devuelve'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-000000054f01', 'reembolso', 25, 'Yape', 'Error',
        (select id from titles where method_name = 'Yape')) $$,
  '23514', 'El reembolso supera lo que queda de ese pago', 'no pasa de lo pagado en ese pedido'
);
select lives_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-000000054f01', 'reembolso', 15, 'Yape', 'Error',
        (select id from titles where method_name = 'Yape')) $$,
  'el admin reembolsa parte de un pago'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-000000054f01', 'reembolso', 10, 'Yape', 'Error',
        (select id from titles where method_name = 'Yape')) $$,
  '23514', 'El reembolso supera lo que queda de ese pago', 'lo ya reembolsado de ese pago cuenta'
);
select throws_ok(
  $$ insert into public.payments (restoration_id, amount, method_name, refunded_payment_id) values
       ('00000000-0000-0000-0000-000000054f01', 5, 'Yape',
        (select id from titles where method_name = 'Visa')) $$,
  '23514', null, 'solo un reembolso devuelve un pago'
);

-- Guía antigua con su orden de piezas: como antes, sin nombre de pedido por pago.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a01","role":"authenticated"}', true);
insert into public.payments (restoration_id, amount, method_name)
  values ('00000000-0000-0000-0000-000000054f02', 20, 'Efectivo');
select is(
  (select shopify_order_title from titles where restoration_id = '00000000-0000-0000-0000-000000054f02'),
  null, 'en una guía con la orden de piezas el pago no tiene pedido propio'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a02","role":"authenticated"}', true);
select throws_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id) values
       ('00000000-0000-0000-0000-000000054f02', 'reembolso', 5, 'Yape', 'Error',
        (select id from titles where method_name = 'Visa')) $$,
  '23514', 'El pago que se reembolsa no es de esta guía', 'el pago debe ser de la misma guía'
);
select lives_ok(
  $$ insert into public.payments (restoration_id, kind, amount, method_name, reason) values
       ('00000000-0000-0000-0000-000000054f02', 'reembolso', 5, 'Efectivo', 'Error') $$,
  'ni su reembolso tiene que decir qué pago devuelve'
);

-- Preparación: al entregarse todas las piezas que se cobran.
reset role;
delete from public.shopify_sync_jobs where entity_id = '00000000-0000-0000-0000-000000054f01';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000054a01","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.deliver_pieces_with_balance(array['00000000-0000-0000-0000-000000054b01']::uuid[]) $$,
  'se entrega la primera pieza'
);
select is(
  (select count(*)::int from jobs where kind = 'order.fulfill'), 0,
  'con una pieza por entregar los pedidos aún no se preparan'
);
select lives_ok(
  $$ select * from public.deliver_pieces_with_balance(array['00000000-0000-0000-0000-000000054b02']::uuid[]) $$,
  'se entrega la última'
);
select results_eq(
  $$ select kind, entity_id from jobs where kind = 'order.fulfill' $$,
  $$ values ('order.fulfill', '00000000-0000-0000-0000-000000054f01') $$,
  'entregada la guía, se preparan sus pedidos de pago'
);

select * from finish();
rollback;
