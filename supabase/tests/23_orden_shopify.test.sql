begin;

select plan(16);

insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000bb1', 'ventas@orden.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-000000000bb3', 'admin@orden.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}');

insert into public.clients (id, kind, first_name, shopify_customer_id)
  values ('00000000-0000-0000-0000-00000000bb20', 'persona', 'Ana', 'gid://shopify/Customer/bb20');

-- Sin orden: los cambios de piezas no encolan nada para Shopify.
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000bb30', '00000000-0000-0000-0000-00000000bb20', 'contado');
insert into public.pieces (id, restoration_id, description, price, approved_at, status) values
  ('00000000-0000-0000-0000-00000000bb31', '00000000-0000-0000-0000-00000000bb30', 'Fuente', 100, now(), 'aprobada'),
  ('00000000-0000-0000-0000-00000000bb32', '00000000-0000-0000-0000-00000000bb30', 'Jarra', 50, null, 'registrada');

-- Con orden creada.
insert into public.restorations (id, client_id, payment_type)
  values ('00000000-0000-0000-0000-00000000bb40', '00000000-0000-0000-0000-00000000bb20', 'contado');
insert into public.pieces (id, restoration_id, description, price, approved_at, status, arrived_at,
    first_sent_at, last_sent_at, last_returned_at) values
  ('00000000-0000-0000-0000-00000000bb41', '00000000-0000-0000-0000-00000000bb40', 'Fuente', 100, now(), 'aprobada',
    now(), null, null, null),
  ('00000000-0000-0000-0000-00000000bb42', '00000000-0000-0000-0000-00000000bb40', 'Bandeja', 80, now(), 'aprobada',
    now(), null, null, null),
  ('00000000-0000-0000-0000-00000000bb43', '00000000-0000-0000-0000-00000000bb40', 'Copa', 30, now(), 'enviada_taller',
    now(), now() - interval '2 days', now() - interval '2 days', now() - interval '1 day');
-- La orden se crea con las piezas ya aprobadas (lo hace el handler de order.create).
update public.restorations set shopify_order_id = 'gid://shopify/Order/bb40', shopify_order_name = '#1001'
where id = '00000000-0000-0000-0000-00000000bb40';

create temporary view edit_jobs as
  select status from public.shopify_sync_jobs
  where kind = 'order.edit' and entity_id = '00000000-0000-0000-0000-00000000bb40';
create temporary view fulfill_jobs as
  select status from public.shopify_sync_jobs
  where kind = 'order.fulfill' and entity_id = '00000000-0000-0000-0000-00000000bb40';
grant select on edit_jobs, fulfill_jobs to authenticated;

select is((select count(*)::int from edit_jobs), 0, 'crear la orden con sus piezas no encola ediciones');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000bb31']::uuid[], 'anulada', 'Error') $$,
  'ventas anula una pieza de una restauración sin orden'
);
reset role;
select is(
  (select count(*)::int from public.shopify_sync_jobs
   where kind like 'order.%' and entity_id = '00000000-0000-0000-0000-00000000bb30'),
  0, 'sin orden, anular no encola nada para Shopify'
);

-- Pieza agregada a una restauración con orden: entra a la orden al aprobarse (P12).
insert into public.pieces (id, restoration_id, description, price)
  values ('00000000-0000-0000-0000-00000000bb44', '00000000-0000-0000-0000-00000000bb40', 'Plato', 40);
select is((select count(*)::int from edit_jobs), 0, 'una pieza agregada sin aprobar no cambia la orden');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000bb44']::uuid[], 'aprobada') $$,
  'ventas aprueba la pieza agregada'
);
reset role;
select is((select count(*)::int from edit_jobs where status = 'pending'), 1, 'aprobarla encola la edición de la orden');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb1","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000bb42']::uuid[], 'anulada', 'Duplicada') $$,
  'ventas anula una pieza aprobada'
);
reset role;
select is((select count(*)::int from edit_jobs), 1, 'con una edición pendiente no se encola otra');

-- Cambio de precio (P12): solo admin, con motivo.
update public.shopify_sync_jobs set status = 'processing'
where kind = 'order.edit' and entity_id = '00000000-0000-0000-0000-00000000bb40';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-00000000bb41', 120, 'Más trabajo') $$,
  '42501', null, 'ventas no cambia el precio con la orden creada'
);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb3","role":"authenticated"}', true);
select throws_ok(
  $$ update public.pieces set price = 120 where id = '00000000-0000-0000-0000-00000000bb41' $$,
  '23514', null, 'ni el admin edita el precio directo: va por el flujo de la orden'
);
select throws_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-00000000bb41', 120, '  ') $$,
  '23514', 'Escribe el motivo del cambio de precio.', 'el cambio de precio exige motivo'
);
select lives_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-00000000bb41', 120, 'Requiere soldadura adicional') $$,
  'el admin cambia el precio con motivo'
);
reset role;
select results_eq(
  $$ select p.price, h.event::text, h.note from public.pieces p
     join public.piece_status_history h on h.piece_id = p.id and h.event = 'cambio_precio'
     where p.id = '00000000-0000-0000-0000-00000000bb41' $$,
  $$ values (120.00::numeric, 'cambio_precio', 'Requiere soldadura adicional') $$,
  'el precio cambia y el motivo queda en el historial'
);
select is(
  (select count(*)::int from edit_jobs where status = 'pending'), 1,
  'con la edición anterior en curso, el cambio encola otra para no perderse'
);

-- Entrega (P44): se encola la preparación de la línea.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000bb3","role":"authenticated"}', true);
select lives_ok(
  $$ select * from public.change_piece_status(array['00000000-0000-0000-0000-00000000bb43']::uuid[], 'entregada') $$,
  'el admin entrega la Copa'
);
reset role;
select is((select count(*)::int from fulfill_jobs where status = 'pending'), 1, 'entregar encola la preparación en Shopify');

select * from finish();
rollback;
