begin;

select plan(9);

-- Ventas asigna y cambia el precio de venta de las piezas (2026-10-21).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000051a1', 'ventas@precio.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000051c1', 'persona', 'Rosa');
-- R1: guía activa. R2: con la orden de Shopify creada.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000051d1', '00000000-0000-0000-0000-0000000051c1', 'contado'),
  ('00000000-0000-0000-0000-0000000051d2', '00000000-0000-0000-0000-0000000051c1', 'contado');
-- E1: sin precio. E2: con precio. E3: con orden y precio.
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000051e1', '00000000-0000-0000-0000-0000000051d1', 'Fuente', null),
  ('00000000-0000-0000-0000-0000000051e2', '00000000-0000-0000-0000-0000000051d1', 'Jarra', 100),
  ('00000000-0000-0000-0000-0000000051e3', '00000000-0000-0000-0000-0000000051d2', 'Copa', 100);
update public.restorations set shopify_order_id = 'gid://shopify/Order/51d2', shopify_order_name = '#5102'
  where id = '00000000-0000-0000-0000-0000000051d2';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000051a1","role":"authenticated"}', true);

-- 1. Sin la orden: por la RPC y editando la pieza.
select is(
  public.set_piece_sale_price('00000000-0000-0000-0000-0000000051e1', 80.5),
  '00000000-0000-0000-0000-0000000051d1'::uuid,
  'ventas asigna el precio de venta (devuelve la restauración)'
);
select is(
  (select price from public.pieces where id = '00000000-0000-0000-0000-0000000051e1'),
  80.50::numeric, 'el precio queda asignado'
);
select lives_ok(
  $$ update public.pieces set price = 120 where id = '00000000-0000-0000-0000-0000000051e2' $$,
  'ventas cambia el precio editando la pieza'
);
select is(
  (select price from public.pieces where id = '00000000-0000-0000-0000-0000000051e2'),
  120.00::numeric, 'el precio cambiado queda guardado'
);

-- 2. Con la orden creada: con motivo.
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000051e3', 120) $$,
  '23514', 'Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)',
  'con la orden creada, el precio asignado no se cambia directo'
);
select lives_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-0000000051e3', 130, 'Más trabajo') $$,
  'ventas cambia el precio con motivo con la orden creada'
);
select is(
  (select price from public.pieces where id = '00000000-0000-0000-0000-0000000051e3'),
  130.00::numeric, 'el precio cambiado con motivo queda guardado'
);

-- 3. Al registrar la restauración, ventas ya pone el precio.
create temporary table created_by_sales on commit drop as
select * from public.create_restoration(
  '00000000-0000-0000-0000-0000000051c1', null, 'contado', null, '',
  '[{"description": "Bandeja", "price": "45"}]'
);
select results_eq(
  $$ select p.price from public.pieces p join created_by_sales c on c.id = p.restoration_id $$,
  $$ values (45.00::numeric) $$,
  'ventas registra piezas con su precio de venta'
);
select results_eq(
  $$ select r.total from public.restorations r join created_by_sales c on c.id = r.id $$,
  $$ values (45.00::numeric) $$,
  'el total suma el precio'
);

select * from finish();
rollback;
