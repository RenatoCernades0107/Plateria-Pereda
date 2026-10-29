begin;

select plan(14);

-- Pago solo en el sistema (pedido del 2026-10-28): el admin corrige un cobro que se
-- hizo creando el pedido directamente en Shopify.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000056a01', 'ventas@sinshopify.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000056a02', 'admin@sinshopify.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-000000056c01', 'persona', 'Ana');
-- 56f1: guía nueva (un pedido por pago); 56f2: guía antigua con su orden de piezas.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-000000056f01', '00000000-0000-0000-0000-000000056c01', 'contado'),
  ('00000000-0000-0000-0000-000000056f02', '00000000-0000-0000-0000-000000056c01', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity, approved_at, status) values
  ('00000000-0000-0000-0000-000000056b01', '00000000-0000-0000-0000-000000056f01', 'Copa', 100, 1, now(), 'aprobada'),
  ('00000000-0000-0000-0000-000000056b02', '00000000-0000-0000-0000-000000056f02', 'Jarra', 50, 1, now(), 'aprobada');
update public.restorations set shopify_order_id = 'gid://shopify/Order/56f2', shopify_order_name = '#1001'
where id = '00000000-0000-0000-0000-000000056f02';

create temporary view jobs as
  select kind, entity_id from public.shopify_sync_jobs
  where entity_id in ('00000000-0000-0000-0000-000000056f01', '00000000-0000-0000-0000-000000056f02');
grant select on jobs to authenticated;

set local role authenticated;

-- Ventas no puede saltarse Shopify.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000056a01","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.payments (restoration_id, amount, method_name, skip_shopify)
    values ('00000000-0000-0000-0000-000000056f01', 30, 'Efectivo', true)$$,
  '42501', null, 'ventas no registra pagos sin Shopify'
);

-- El admin sí: cuenta en lo pagado, sin pedido y sin encolar nada.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000056a02","role":"authenticated"}', true);
select lives_ok(
  $$insert into public.payments (restoration_id, amount, method_name, skip_shopify)
    values ('00000000-0000-0000-0000-000000056f01', 30, 'Efectivo', true)$$,
  'el admin registra un pago sin Shopify'
);
select results_eq(
  $$ select shopify_order_title, shopify_synced_at is not null, skip_shopify from public.payments
     where restoration_id = '00000000-0000-0000-0000-000000056f01' $$,
  $$ values (null::text, true, true) $$,
  'queda sin pedido y como ya en Shopify'
);
select is(
  (select paid from public.restorations where id = '00000000-0000-0000-0000-000000056f01'),
  30.00::numeric, 'cuenta en lo pagado'
);
select is(
  (select count(*)::int from jobs where entity_id = '00000000-0000-0000-0000-000000056f01'),
  0, 'no encola la conciliación'
);

-- El siguiente pago normal sigue la numeración (el corregido no tiene pedido) y
-- completa el total: es el Saldo.
select lives_ok(
  $$insert into public.payments (restoration_id, amount, method_name)
    values ('00000000-0000-0000-0000-000000056f01', 70, 'Yape')$$,
  'luego un pago normal'
);
select is(
  (select shopify_order_title from public.payments
   where restoration_id = '00000000-0000-0000-0000-000000056f01' and method_name = 'Yape'),
  'Saldo Guía ' || (select code from public.restorations where id = '00000000-0000-0000-0000-000000056f01'),
  'el pago normal tiene su pedido (el saldo cuenta el pago sin Shopify)'
);
select is(
  (select count(*)::int from jobs where entity_id = '00000000-0000-0000-0000-000000056f01'),
  1, 'el pago normal sí encola su pedido'
);

-- Guía antigua con la orden de piezas (2026-10-29): se concilia en el sistema sin
-- tocar su orden.
select lives_ok(
  $$insert into public.payments (restoration_id, amount, method_name, skip_shopify)
    values ('00000000-0000-0000-0000-000000056f02', 10, 'Efectivo', true)$$,
  'el admin registra un pago sin Shopify en una guía antigua'
);
select results_eq(
  $$ select shopify_order_title, shopify_synced_at is not null from public.payments
     where restoration_id = '00000000-0000-0000-0000-000000056f02' $$,
  $$ values (null::text, true) $$,
  'en la guía antigua también queda sin pedido y como ya en Shopify'
);
select is(
  (select paid from public.restorations where id = '00000000-0000-0000-0000-000000056f02'),
  10.00::numeric, 'cuenta en lo pagado de la guía antigua'
);
select is(
  (select count(*)::int from jobs
   where entity_id = '00000000-0000-0000-0000-000000056f02' and kind = 'payment.sync'),
  0, 'no encola la conciliación de la orden de piezas'
);

-- Solo pagos, no reembolsos.
select throws_ok(
  $$insert into public.payments (restoration_id, kind, amount, method_name, reason, skip_shopify,
      refunded_payment_id)
    select restoration_id, 'reembolso', 5, 'Efectivo', 'Prueba', true, id from public.payments
    where restoration_id = '00000000-0000-0000-0000-000000056f01' and method_name = 'Yape'$$,
  '23514', null, 'un reembolso no se marca sin Shopify'
);

-- Un reembolso del pago sin Shopify queda solo en el sistema (su pago no tiene pedido).
select lives_ok(
  $$insert into public.payments (restoration_id, kind, amount, method_name, reason, refunded_payment_id)
    select restoration_id, 'reembolso', 5, 'Efectivo', 'Prueba', id from public.payments
    where restoration_id = '00000000-0000-0000-0000-000000056f01' and skip_shopify$$,
  'se reembolsa un pago sin Shopify'
);

select * from finish();
rollback;
