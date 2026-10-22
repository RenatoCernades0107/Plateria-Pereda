begin;

select plan(8);

-- La cantidad multiplica el precio (2026-10-22): el total de la restauración y el de
-- la cotización de WhatsApp suman precio × cantidad.
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000052a1', 'ventas@multiplica.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}');
insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000052c1', 'persona', 'Multiplica');

-- R1: sin orden. R2: con la orden de Shopify creada.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000052d1', '00000000-0000-0000-0000-0000000052c1', 'contado'),
  ('00000000-0000-0000-0000-0000000052d2', '00000000-0000-0000-0000-0000000052c1', 'contado');
insert into public.pieces (id, restoration_id, description, price, quantity) values
  ('00000000-0000-0000-0000-0000000052e1', '00000000-0000-0000-0000-0000000052d1', 'Cucharitas', 50, 3),
  ('00000000-0000-0000-0000-0000000052e2', '00000000-0000-0000-0000-0000000052d1', 'Fuente', 10, 1),
  ('00000000-0000-0000-0000-0000000052e3', '00000000-0000-0000-0000-0000000052d1', 'Tenedores', null, 6),
  ('00000000-0000-0000-0000-0000000052e4', '00000000-0000-0000-0000-0000000052d2', 'Copas', 20, 2),
  ('00000000-0000-0000-0000-0000000052e5', '00000000-0000-0000-0000-0000000052d2', 'Platos', null, 2);

-- 1. Restauración.
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-0000000052d1'),
  160.00::numeric, 'el total suma precio × cantidad (sin precio suma 0)'
);
update public.pieces set quantity = 4 where id = '00000000-0000-0000-0000-0000000052e1';
select is(
  (select total from public.restorations where id = '00000000-0000-0000-0000-0000000052d1'),
  210.00::numeric, 'cambiar la cantidad recalcula el total'
);

-- 2. Con la orden de Shopify creada, la cantidad de una pieza con precio no cambia.
update public.restorations set shopify_order_id = 'gid://shopify/Order/52d2', shopify_order_name = '#5202'
  where id = '00000000-0000-0000-0000-0000000052d2';
select throws_ok(
  $$ update public.pieces set quantity = 3 where id = '00000000-0000-0000-0000-0000000052e4' $$,
  '23514', 'Con la orden de Shopify creada, la cantidad de una pieza con precio no se cambia (P12)',
  'con la orden creada, la cantidad de una pieza con precio no cambia'
);
select lives_ok(
  $$ update public.pieces set quantity = 5 where id = '00000000-0000-0000-0000-0000000052e5' $$,
  'una pieza sin precio sí cambia su cantidad'
);
select lives_ok(
  $$ update public.pieces set description = 'Copas de plata' where id = '00000000-0000-0000-0000-0000000052e4' $$,
  'guardar la pieza sin cambiar la cantidad no choca con el guard'
);

-- 3. Cotización de WhatsApp.
create temporary table created (id uuid);
grant all on created to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000052a1","role":"authenticated"}', true);
insert into created
select id from public.create_whatsapp_quote(
  '00000000-0000-0000-0000-0000000052c1', null, null, null, 'contado', null, '',
  '[{"description": "Copas cotizadas", "price": 90, "quantity": 4},
    {"description": "Bandeja cotizada", "price": 15.5},
    {"description": "Jarra por definir", "quantity": 2}]');
reset role;
select is(
  (select total from public.whatsapp_quotes where id = (select id from created)),
  375.50::numeric, 'el total de la cotización suma precio × cantidad'
);
update public.whatsapp_quote_items set quantity = 1
  where quote_id = (select id from created) and description = 'Copas cotizadas';
select is(
  (select total from public.whatsapp_quotes where id = (select id from created)),
  105.50::numeric, 'cambiar la cantidad cotizada recalcula el total'
);
delete from public.whatsapp_quote_items
  where quote_id = (select id from created) and description = 'Bandeja cotizada';
select is(
  (select total from public.whatsapp_quotes where id = (select id from created)),
  90.00::numeric, 'quitar una pieza cotizada recalcula el total'
);

select * from finish();
rollback;
