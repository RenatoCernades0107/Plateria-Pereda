begin;

select plan(26);

-- Logística y el precio de venta; marca "Urgente" (2026-10-19).
insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000045a1', 'admin@urgente.test', '{"role":"admin"}', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000045a2', 'ventas@urgente.test', '{"role":"ventas"}', '{"full_name":"Vera Ventas"}'),
  ('00000000-0000-0000-0000-0000000045a3', 'logistica@urgente.test', '{"role":"logistica"}', '{"full_name":"Lalo Logística"}');

insert into public.clients (id, kind, first_name)
  values ('00000000-0000-0000-0000-0000000045c1', 'persona', 'Rosa');
-- R1: guía activa. R2: guía pasada (anulada). R3: con la orden de Shopify creada.
insert into public.restorations (id, client_id, payment_type) values
  ('00000000-0000-0000-0000-0000000045d1', '00000000-0000-0000-0000-0000000045c1', 'contado'),
  ('00000000-0000-0000-0000-0000000045d2', '00000000-0000-0000-0000-0000000045c1', 'contado'),
  ('00000000-0000-0000-0000-0000000045d3', '00000000-0000-0000-0000-0000000045c1', 'contado');
-- E1: sin precio. E2: en Consulta. E3: de la guía pasada. E4: con orden y precio.
-- E5: entregada.
insert into public.pieces (id, restoration_id, description, price) values
  ('00000000-0000-0000-0000-0000000045e1', '00000000-0000-0000-0000-0000000045d1', 'Fuente', null),
  ('00000000-0000-0000-0000-0000000045e2', '00000000-0000-0000-0000-0000000045d1', 'Jarra', 100),
  ('00000000-0000-0000-0000-0000000045e3', '00000000-0000-0000-0000-0000000045d2', 'Bandeja', 100),
  ('00000000-0000-0000-0000-0000000045e4', '00000000-0000-0000-0000-0000000045d3', 'Copa', 100),
  ('00000000-0000-0000-0000-0000000045e5', '00000000-0000-0000-0000-0000000045d1', 'Plato', 100);
update public.pieces set status = 'en_consulta' where id = '00000000-0000-0000-0000-0000000045e2';
update public.pieces set status = 'anulada', cancelled_at = now()
  where id = '00000000-0000-0000-0000-0000000045e3';
update public.pieces set status = 'entregada', delivered_at = now()
  where id = '00000000-0000-0000-0000-0000000045e5';
update public.restorations set shopify_order_id = 'gid://shopify/Order/45d3', shopify_order_name = '#4503'
  where id = '00000000-0000-0000-0000-0000000045d3';

-- 1. Consulta → Espera respuesta cliente: también logística.
select is(
  (select roles::text from public.piece_status_transitions
   where from_status = 'en_consulta' and to_status = 'en_espera'),
  '{admin,ventas,logistica}', 'Consulta → Espera respuesta cliente incluye a logística'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a3","role":"authenticated"}', true);
select results_eq(
  $$ select status::text from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000045e2']::uuid[], 'en_espera') $$,
  $$ values ('en_espera') $$,
  'logística pasa una pieza de Consulta a Espera respuesta cliente'
);
select throws_ok(
  $$ select * from public.change_piece_status(
       array['00000000-0000-0000-0000-0000000045e2']::uuid[], 'aprobada') $$,
  '42501', 'Tu rol no puede hacer este cambio de estado.', 'logística sigue sin aprobar'
);

-- 2. Precio de venta: logística lo asigna por la RPC y lo ve en la vista operativa.
select is(
  public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e1', 80.5),
  '00000000-0000-0000-0000-0000000045d1'::uuid,
  'logística asigna el precio de venta (devuelve la restauración)'
);
select is(
  (select price from public.pieces_operational where id = '00000000-0000-0000-0000-0000000045e1'),
  80.50::numeric, 'logística ve el precio de venta en la vista operativa'
);
select lives_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e1', null) $$,
  'logística deja el precio sin asignar'
);
select is(
  (select price from public.pieces_operational where id = '00000000-0000-0000-0000-0000000045e1'),
  null, 'el precio vuelve a quedar sin asignar'
);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e1', -1) $$,
  '22023', 'Ingresa un monto válido (hasta 2 decimales).', 'no acepta precios negativos'
);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e1', 1.234) $$,
  '22023', 'Ingresa un monto válido (hasta 2 decimales).', 'ni más de 2 decimales'
);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e3', 10) $$,
  '23503', 'La pieza no existe', 'logística no toca piezas de guías pasadas'
);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e4', 120) $$,
  '23514', 'Con la orden de Shopify creada, el precio se cambia desde el flujo de la orden (P12)',
  'con la orden creada, el precio asignado no se cambia directo'
);
select lives_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-0000000045e4', 120, 'Más trabajo') $$,
  'logística cambia el precio con motivo con la orden creada'
);
select is(
  (select price from public.pieces_operational where id = '00000000-0000-0000-0000-0000000045e4'),
  120.00::numeric, 'el precio cambiado se ve en la vista'
);
select throws_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-0000000045e3', 120, 'Más trabajo') $$,
  '23503', 'La pieza no existe', 'logística no cambia el precio en una guía pasada'
);

-- 3. Urgente: logística marca piezas de guías activas; las entregadas se omiten.
select results_eq(
  $$ select piece_id, urgent from public.set_pieces_urgent(
       array['00000000-0000-0000-0000-0000000045e1', '00000000-0000-0000-0000-0000000045e5']::uuid[], true) $$,
  $$ values ('00000000-0000-0000-0000-0000000045e1'::uuid, true) $$,
  'logística marca como urgente; la pieza entregada no cambia'
);
select is(
  (select urgent from public.pieces_operational where id = '00000000-0000-0000-0000-0000000045e5'),
  false, 'la pieza entregada sigue sin marca'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(array['00000000-0000-0000-0000-0000000045e5']::uuid[], true) $$,
  '23514', 'Una pieza cerrada o entregada no se marca como urgente.',
  'si todas están cerradas o entregadas, error'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(array['00000000-0000-0000-0000-0000000045e3']::uuid[], true) $$,
  '42501', 'Tu rol no puede marcar piezas de restauraciones pasadas.',
  'logística no marca piezas de guías pasadas'
);

-- 4. Ventas: marca y quita urgente, pero no asigna el precio.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a2","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e1', 10) $$,
  '42501', 'Solo el administrador y logística asignan el precio de venta.',
  'ventas no asigna el precio de venta'
);
select throws_ok(
  $$ update public.pieces set price = 10 where id = '00000000-0000-0000-0000-0000000045e1' $$,
  '42501', 'Solo el administrador y logística asignan el precio de venta.',
  'ni editando la tabla'
);
select throws_ok(
  $$ select public.change_piece_price('00000000-0000-0000-0000-0000000045e4', 130, 'Otro motivo') $$,
  '42501', null, 'ventas no cambia el precio con la orden creada'
);
select lives_ok(
  $$ select * from public.set_pieces_urgent(array['00000000-0000-0000-0000-0000000045e1']::uuid[], false) $$,
  'ventas quita la marca de urgente'
);
select is(
  (select urgent from public.pieces where id = '00000000-0000-0000-0000-0000000045e1'),
  false, 'la pieza ya no es urgente'
);
select throws_ok(
  $$ select * from public.set_pieces_urgent(array[]::uuid[], true) $$,
  '22023', 'Elige al menos una pieza', 'exige al menos una pieza'
);

-- 5. Admin: los guards de la pieza siguen aplicando (una anulada no se edita).
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000045a1","role":"authenticated"}', true);
select throws_ok(
  $$ select public.set_piece_sale_price('00000000-0000-0000-0000-0000000045e3', 50) $$,
  '23514', 'Una pieza anulada, rechazada o sin arreglo no se puede editar',
  'una pieza anulada no cambia de precio'
);

-- 6. La marca pasa por la tabla: queda en la auditoría con quien la cambió.
reset role;
select is(
  (select count(*)::int from public.audit_log
   where table_name = 'pieces' and record_id = '00000000-0000-0000-0000-0000000045e1'
     and changes ? 'urgent' and actor_id = '00000000-0000-0000-0000-0000000045a3'),
  1, 'la auditoría guarda que logística marcó la pieza como urgente'
);

select * from finish();
rollback;
